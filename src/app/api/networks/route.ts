import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/networks — User-facing VPC info.
 * Returns VPC assignments for the current user's VMs.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Find all VPC assignments for VMs owned by this user
        const assignments = await prisma.vpcAssignment.findMany({
            where: {
                vpsInstance: {
                    userId: session.user.id,
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

        return NextResponse.json({ assignments });
    } catch (error) {
        console.error("[networks] Error:", error);
        return NextResponse.json({ error: "Failed to load network info" }, { status: 500 });
    }
}
