import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/vpcs/[vpcId]/assign — Assign a VM to this VPC.
 * Body: { vpsInstanceId, ipAddress? }
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ vpcId: string }> }
) {
    try {
        const session = await auth();
        const role = (session?.user as Record<string, unknown>)?.role;
        if (!session?.user?.id || role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { vpcId } = await params;
        const body = await req.json();
        const { vpsInstanceId, ipAddress } = body as {
            vpsInstanceId: string;
            ipAddress?: string;
        };

        if (!vpsInstanceId) {
            return NextResponse.json({ error: "vpsInstanceId is required" }, { status: 400 });
        }

        // Verify VPC exists
        const vpc = await prisma.vpc.findUnique({ where: { id: vpcId } });
        if (!vpc) {
            return NextResponse.json({ error: "VPC not found" }, { status: 404 });
        }

        // Verify VM exists
        const vm = await prisma.vpsInstance.findUnique({
            where: { id: vpsInstanceId },
            include: { vpcAssignment: true },
        });
        if (!vm) {
            return NextResponse.json({ error: "VM not found" }, { status: 404 });
        }

        // Check if VM is already assigned to a VPC
        if (vm.vpcAssignment) {
            return NextResponse.json(
                { error: "VM is already assigned to a VPC. Unassign it first." },
                { status: 409 }
            );
        }

        // Check IP uniqueness within the VPC
        if (ipAddress) {
            const ipConflict = await prisma.vpcAssignment.findFirst({
                where: { vpcId, ipAddress },
            });
            if (ipConflict) {
                return NextResponse.json(
                    { error: `IP ${ipAddress} is already assigned in this VPC` },
                    { status: 409 }
                );
            }
        }

        const assignment = await prisma.vpcAssignment.create({
            data: {
                vpcId,
                vpsInstanceId,
                bridgeName: vpc.vnetName,
                ipAddress: ipAddress || null,
            },
            include: {
                vpc: { select: { name: true, vlanId: true, subnet: true } },
                vpsInstance: { select: { vmId: true, name: true, node: true } },
            },
        });

        void audit({
            userId: session.user.id,
            action: "VPC_ASSIGN_VM",
            resourceType: "Network",
            resourceId: vpcId,
            metadata: {
                vpsInstanceId,
                vmId: assignment.vpsInstance.vmId,
                vlanId: assignment.vpc.vlanId,
                ipAddress,
            },
            req,
        });

        return NextResponse.json(assignment, { status: 201 });
    } catch (error) {
        console.error("[vpcs] Assign error:", error);
        return NextResponse.json({ error: "Failed to assign VM" }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/vpcs/[vpcId]/assign — Unassign a VM from this VPC.
 * Body: { vpsInstanceId }
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ vpcId: string }> }
) {
    try {
        const session = await auth();
        const role = (session?.user as Record<string, unknown>)?.role;
        if (!session?.user?.id || role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { vpcId } = await params;
        const body = await req.json();
        const { vpsInstanceId } = body as { vpsInstanceId: string };

        if (!vpsInstanceId) {
            return NextResponse.json({ error: "vpsInstanceId is required" }, { status: 400 });
        }

        const assignment = await prisma.vpcAssignment.findFirst({
            where: { vpcId, vpsInstanceId },
            include: {
                vpc: { select: { vlanId: true } },
                vpsInstance: { select: { vmId: true } },
            },
        });

        if (!assignment) {
            return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        await prisma.vpcAssignment.delete({ where: { id: assignment.id } });

        void audit({
            userId: session.user.id,
            action: "VPC_UNASSIGN_VM",
            resourceType: "Network",
            resourceId: vpcId,
            metadata: {
                vpsInstanceId,
                vmId: assignment.vpsInstance.vmId,
                vlanId: assignment.vpc.vlanId,
            },
            req,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[vpcs] Unassign error:", error);
        return NextResponse.json({ error: "Failed to unassign VM" }, { status: 500 });
    }
}
