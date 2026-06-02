import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/networks — User-facing VPC info.
 * Returns VPC assignments for the current user's VMs,
 * plus the user's owned VPCs and unassigned VMs.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        // Find all VPC assignments for VMs owned by this user
        const assignments = await prisma.vpcAssignment.findMany({
            where: {
                vpsInstance: {
                    userId,
                },
            },
            include: {
                vpc: {
                    select: {
                        id: true,
                        name: true,
                        vlanId: true,
                        subnet: true,
                        gateway: true,
                        status: true,
                        userId: true,
                    },
                },
                vpsInstance: {
                    select: {
                        id: true,
                        vmId: true,
                        name: true,
                        status: true,
                        node: true,
                    },
                },
            },
            orderBy: { assignedAt: "desc" },
        });

        // User's own VPCs
        const ownedVpcs = await prisma.vpc.findMany({
            where: { userId },
            select: {
                id: true,
                name: true,
                vlanId: true,
                vnetName: true,
                subnet: true,
                gateway: true,
                status: true,
                createdAt: true,
                _count: { select: { assignments: true } },
            },
            orderBy: { createdAt: "asc" },
        });

        // User's VMs not yet in a VPC (for assign dropdown)
        const unassignedVMs = await prisma.vpsInstance.findMany({
            where: { userId, vpcAssignment: null },
            select: { id: true, vmId: true, name: true, status: true, node: true },
        });

        // User limits
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { maxVpcs: true, role: true },
        });

        return NextResponse.json({
            assignments,
            ownedVpcs,
            unassignedVMs,
            maxVpcs: user?.maxVpcs ?? 3,
            isAdmin: user?.role === "ADMIN",
        });
    } catch (error) {
        console.error("[networks] Error:", error);
        return NextResponse.json({ error: "Failed to load network info" }, { status: 500 });
    }
}
