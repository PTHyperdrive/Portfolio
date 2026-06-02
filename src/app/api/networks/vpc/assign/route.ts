import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * POST /api/networks/vpc/assign — Assign user's own VM to their own VPC.
 * Body: { vpcId: string, vpsInstanceId: string, ipAddress?: string }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const { vpcId, vpsInstanceId, ipAddress } = (await req.json()) as {
            vpcId: string;
            vpsInstanceId: string;
            ipAddress?: string;
        };

        if (!vpcId || !vpsInstanceId) {
            return NextResponse.json(
                { error: "vpcId and vpsInstanceId are required" },
                { status: 400 },
            );
        }

        // ── Ownership: verify user owns the VPC ─────────────────────
        const vpc = await prisma.vpc.findUnique({ where: { id: vpcId } });
        if (!vpc) {
            return NextResponse.json({ error: "VPC not found" }, { status: 404 });
        }
        if (vpc.userId !== userId) {
            return NextResponse.json({ error: "You can only assign VMs to your own VPCs" }, { status: 403 });
        }

        // ── Ownership: verify user owns the VM ──────────────────────
        const vm = await prisma.vpsInstance.findUnique({
            where: { id: vpsInstanceId },
            include: { vpcAssignment: true },
        });
        if (!vm) {
            return NextResponse.json({ error: "VM not found" }, { status: 404 });
        }
        if (vm.userId !== userId) {
            return NextResponse.json({ error: "You can only assign your own VMs" }, { status: 403 });
        }

        // ── Check VM not already assigned ───────────────────────────
        if (vm.vpcAssignment) {
            return NextResponse.json(
                { error: "VM is already assigned to a VPC. Unassign it first." },
                { status: 409 },
            );
        }

        // ── Check IP uniqueness within VPC ──────────────────────────
        if (ipAddress) {
            const ipConflict = await prisma.vpcAssignment.findFirst({
                where: { vpcId, ipAddress },
            });
            if (ipConflict) {
                return NextResponse.json(
                    { error: `IP ${ipAddress} is already assigned in this VPC` },
                    { status: 409 },
                );
            }
        }

        // ── Create assignment ───────────────────────────────────────
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
            userId,
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
        console.error("[networks/vpc/assign] POST error:", error);
        return NextResponse.json({ error: "Failed to assign VM" }, { status: 500 });
    }
}

/**
 * DELETE /api/networks/vpc/assign — Unassign user's VM from their VPC.
 * Body: { vpcId: string, vpsInstanceId: string }
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const { vpcId, vpsInstanceId } = (await req.json()) as {
            vpcId: string;
            vpsInstanceId: string;
        };

        if (!vpcId || !vpsInstanceId) {
            return NextResponse.json(
                { error: "vpcId and vpsInstanceId are required" },
                { status: 400 },
            );
        }

        // ── Ownership: verify user owns the VPC ─────────────────────
        const vpc = await prisma.vpc.findUnique({ where: { id: vpcId } });
        if (!vpc || vpc.userId !== userId) {
            return NextResponse.json({ error: "VPC not found or access denied" }, { status: 403 });
        }

        // ── Find and verify assignment ──────────────────────────────
        const assignment = await prisma.vpcAssignment.findFirst({
            where: { vpcId, vpsInstanceId },
            include: {
                vpc: { select: { vlanId: true } },
                vpsInstance: { select: { vmId: true, userId: true } },
            },
        });

        if (!assignment) {
            return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        // Verify the VM belongs to the user
        if (assignment.vpsInstance.userId !== userId) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        await prisma.vpcAssignment.delete({ where: { id: assignment.id } });

        void audit({
            userId,
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
        console.error("[networks/vpc/assign] DELETE error:", error);
        return NextResponse.json({ error: "Failed to unassign VM" }, { status: 500 });
    }
}
