import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isHostInRange } from "@/lib/vpc-subnet";
import { attachVmToVpcNetwork, detachVmFromVpcNetwork } from "@/lib/proxmox";
import { addDhcpLease, removeDhcpLeaseByComment } from "@/lib/mikrotik";

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
        const { vpcId, vpsInstanceId, ipAddress, dhcp } = (await req.json()) as {
            vpcId: string;
            vpsInstanceId: string;
            ipAddress?: string;
            // true / undefined = automatic (DHCP-style auto-assign).
            // false = manual: caller must supply a valid in-range ipAddress.
            dhcp?: boolean;
        };
        const autoAssign = dhcp !== false;

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

        // ── Resolve the IP mode (DHCP automatic vs manual static) ────
        const dhcpStart = vpc.dhcpStart ?? "";
        const dhcpEnd = vpc.dhcpEnd ?? "";
        let resolvedIp: string | null = null; // null = DHCP-assigned at boot

        if (!autoAssign) {
            // Manual: caller supplies a valid, in-range, free static IP.
            const taken = await prisma.vpcAssignment.findMany({
                where: { vpcId, ipAddress: { not: null } },
                select: { ipAddress: true },
            });
            const usedIps = new Set(taken.map((a) => a.ipAddress as string));
            if (!ipAddress) {
                return NextResponse.json({ error: "Manual mode requires an ipAddress." }, { status: 400 });
            }
            if (!isHostInRange(ipAddress, dhcpStart, dhcpEnd)) {
                return NextResponse.json({ error: `IP must be within ${dhcpStart}–${dhcpEnd}.` }, { status: 400 });
            }
            if (usedIps.has(ipAddress)) {
                return NextResponse.json({ error: `IP ${ipAddress} is already assigned in this VPC` }, { status: 409 });
            }
            resolvedIp = ipAddress;
        }

        // ── Create assignment ───────────────────────────────────────
        const assignment = await prisma.vpcAssignment.create({
            data: {
                vpcId,
                vpsInstanceId,
                bridgeName: vpc.vnetName, // the user's SDN VNet (per-VLAN bridge)
                ipAddress: resolvedIp,
                dhcp: autoAssign,
            },
            include: {
                vpc: { select: { name: true, vlanId: true, subnet: true } },
                vpsInstance: { select: { vmId: true, name: true, node: true } },
            },
        });

        // ── Push the network config to the actual VM ─────────────────
        // Auto: net0 → VNet bridge + cloud-init DHCP (MikroTik serves the IP).
        // Manual: static cloud-init IP + a MikroTik DHCP reservation so the
        // pool never re-hands it out. Non-fatal: report a warning on failure.
        let networkWarning: string | undefined;
        try {
            const prefix = vpc.subnet.split("/")[1] || "28";
            const { mac } = await attachVmToVpcNetwork(
                assignment.vpsInstance.node,
                assignment.vpsInstance.vmId,
                vpc.vnetName,
                resolvedIp ? `${resolvedIp}/${prefix}` : null,
                resolvedIp ? vpc.gateway : null,
            );
            if (resolvedIp && mac && vpc.networkId) {
                // Per-VM lease comment so unassign removes only this reservation.
                await addDhcpLease(`NRSP-VPC-${vpc.networkId}`, resolvedIp, mac, `NRSP-VM-${assignment.vpsInstance.vmId}`);
            }
        } catch (err) {
            networkWarning = err instanceof Error ? err.message : "Failed to apply VM network config";
            console.warn("[networks/vpc/assign] network push failed:", networkWarning);
        }

        void audit({
            userId,
            action: "VPC_ASSIGN_VM",
            resourceType: "Network",
            resourceId: vpcId,
            metadata: {
                vpsInstanceId,
                vmId: assignment.vpsInstance.vmId,
                vlanId: assignment.vpc.vlanId,
                ipAddress: resolvedIp,
                mode: autoAssign ? "auto" : "manual",
            },
            req,
        });

        return NextResponse.json({ ...assignment, networkWarning }, { status: 201 });
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
                vpsInstance: { select: { vmId: true, node: true, userId: true } },
            },
        });

        if (!assignment) {
            return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        // Verify the VM belongs to the user
        if (assignment.vpsInstance.userId !== userId) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Revert the VM's NIC to the default bridge + DHCP, and drop any
        // manual DHCP reservation for it (best-effort).
        try {
            await detachVmFromVpcNetwork(assignment.vpsInstance.node, assignment.vpsInstance.vmId);
            await removeDhcpLeaseByComment(`NRSP-VM-${assignment.vpsInstance.vmId}`);
        } catch (err) {
            console.warn("[networks/vpc/assign] network revert failed:", err);
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
