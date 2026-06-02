import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
    createVlanInterface,
    addIpAddress,
    addFirewallIsolationRule,
    deleteVlanInterface,
    removeIpAddress,
    removeFirewallRulesByComment,
} from "@/lib/mikrotik";

// ─── Subnet calculation ──────────────────────────────────────────

/**
 * Compute subnet + gateway from VLAN ID.
 *
 * Mapping (VLAN range 501-1000, /28 subnets):
 *   VLAN 501 → 10.50.1.0/28,  gateway 10.50.1.1
 *   VLAN 755 → 10.50.255.0/28
 *   VLAN 756 → 10.51.1.0/28
 *   VLAN 1000 → 10.51.245.0/28
 *
 * IP pool: 10.50.0.0/16 – 10.254.0.0/16 (ample headroom)
 */
function computeSubnet(vlanId: number) {
    const offset = vlanId - 500; // 1-500
    const octet2 = 50 + Math.floor((offset - 1) / 255);
    const octet3 = ((offset - 1) % 255) + 1;
    return {
        subnet: `10.${octet2}.${octet3}.0/28`,
        gateway: `10.${octet2}.${octet3}.1`,
        dhcpStart: `10.${octet2}.${octet3}.2`,
        dhcpEnd: `10.${octet2}.${octet3}.14`,
    };
}

/**
 * GET /api/networks/vpc — List user's owned VPCs + their unassigned VMs.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        const [vpcs, unassignedVMs, user] = await Promise.all([
            // User's own VPCs with assignments
            prisma.vpc.findMany({
                where: { userId },
                include: {
                    assignments: {
                        include: {
                            vpsInstance: {
                                select: {
                                    id: true, vmId: true, name: true,
                                    status: true, node: true,
                                },
                            },
                        },
                    },
                    _count: { select: { assignments: true } },
                },
                orderBy: { createdAt: "asc" },
            }),
            // User's VMs NOT yet in any VPC
            prisma.vpsInstance.findMany({
                where: {
                    userId,
                    vpcAssignment: null,
                },
                select: { id: true, vmId: true, name: true, status: true, node: true },
            }),
            // User's maxVpcs limit
            prisma.user.findUnique({
                where: { id: userId },
                select: { maxVpcs: true, role: true },
            }),
        ]);

        return NextResponse.json({
            vpcs,
            unassignedVMs,
            maxVpcs: user?.maxVpcs ?? 3,
            isAdmin: user?.role === "ADMIN",
        });
    } catch (error) {
        console.error("[networks/vpc] GET error:", error);
        return NextResponse.json({ error: "Failed to load VPCs" }, { status: 500 });
    }
}

/**
 * POST /api/networks/vpc — Create a new VPC.
 * Body: { name: string }
 *
 * Auto-allocates VLAN ID, subnet, and provisions MikroTik resources.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const { name } = (await req.json()) as { name?: string };

        if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 50) {
            return NextResponse.json(
                { error: "VPC name must be between 2 and 50 characters" },
                { status: 400 },
            );
        }

        // ── Check VPC limit ──────────────────────────────────────────
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { maxVpcs: true, role: true, name: true, email: true },
        });

        const isAdmin = user?.role === "ADMIN";
        const currentCount = await prisma.vpc.count({ where: { userId } });

        if (!isAdmin && currentCount >= (user?.maxVpcs ?? 3)) {
            return NextResponse.json(
                { error: `VPC limit reached (${user?.maxVpcs ?? 3}). Submit a ticket to request an increase.` },
                { status: 403 },
            );
        }

        // ── Auto-allocate VLAN ID ────────────────────────────────────
        const usedVlans = await prisma.vpc.findMany({
            select: { vlanId: true },
            orderBy: { vlanId: "asc" },
        });
        const usedSet = new Set(usedVlans.map((v) => v.vlanId));

        let vlanId: number | null = null;
        for (let id = 501; id <= 1000; id++) {
            if (!usedSet.has(id)) {
                vlanId = id;
                break;
            }
        }

        if (vlanId === null) {
            return NextResponse.json(
                { error: "No available VLAN IDs. Contact an administrator." },
                { status: 503 },
            );
        }

        // ── Compute network addresses ────────────────────────────────
        const net = computeSubnet(vlanId);
        const vnetName = `vc${vlanId}`;
        const vlanIfName = `vlan${vlanId}`;
        const username = user?.name || user?.email?.split("@")[0] || "user";
        const userVpcIndex = currentCount + 1;
        const mikrotikComment = `VPC-${username}-${userVpcIndex}`;

        // ── MikroTik provisioning ────────────────────────────────────
        let mikrotikVlanIf: string | null = null;
        const mikrotikErrors: string[] = [];

        try {
            await createVlanInterface(vlanId, vlanIfName);
            mikrotikVlanIf = vlanIfName;
        } catch (err) {
            mikrotikErrors.push(
                `VLAN interface: ${err instanceof Error ? err.message : "Failed"}`,
            );
        }

        try {
            await addIpAddress(`${net.gateway}/28`, vlanIfName, mikrotikComment);
        } catch (err) {
            mikrotikErrors.push(
                `IP address: ${err instanceof Error ? err.message : "Failed"}`,
            );
        }

        try {
            await addFirewallIsolationRule(
                net.subnet,
                "10.0.0.0/23",
                `NRSP-VPC-${vnetName}-isolation`,
            );
        } catch (err) {
            mikrotikErrors.push(
                `Firewall rule: ${err instanceof Error ? err.message : "Failed"}`,
            );
        }

        // ── Database ─────────────────────────────────────────────────
        const vpc = await prisma.vpc.create({
            data: {
                userId,
                name: name.trim(),
                vlanId,
                vnetName,
                mikrotikVlanIf,
                subnet: net.subnet,
                gateway: net.gateway,
                dhcpStart: net.dhcpStart,
                dhcpEnd: net.dhcpEnd,
                description: mikrotikComment,
            },
        });

        // Audit
        void audit({
            userId,
            action: "VPC_CREATE",
            resourceType: "Network",
            resourceId: vpc.id,
            metadata: { vlanId, vnetName, subnet: net.subnet, gateway: net.gateway, mikrotikErrors },
            req,
        });

        return NextResponse.json(
            { vpc, mikrotikErrors: mikrotikErrors.length > 0 ? mikrotikErrors : undefined },
            { status: 201 },
        );
    } catch (error) {
        console.error("[networks/vpc] POST error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create VPC" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/networks/vpc — Delete user's own VPC.
 * Body: { vpcId: string }
 *
 * Refuses if VMs are still assigned. Cleans up MikroTik resources.
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const { vpcId } = (await req.json()) as { vpcId: string };

        if (!vpcId) {
            return NextResponse.json({ error: "vpcId is required" }, { status: 400 });
        }

        // ── Ownership check ──────────────────────────────────────────
        const vpc = await prisma.vpc.findUnique({
            where: { id: vpcId },
            include: { _count: { select: { assignments: true } } },
        });

        if (!vpc) {
            return NextResponse.json({ error: "VPC not found" }, { status: 404 });
        }

        if (vpc.userId !== userId) {
            return NextResponse.json({ error: "You can only delete your own VPCs" }, { status: 403 });
        }

        if (vpc._count.assignments > 0) {
            return NextResponse.json(
                { error: `Unassign all VMs first (${vpc._count.assignments} still assigned)` },
                { status: 409 },
            );
        }

        // ── MikroTik cleanup ─────────────────────────────────────────
        const cleanupErrors: string[] = [];

        try {
            await removeFirewallRulesByComment(`NRSP-VPC-${vpc.vnetName}-isolation`);
        } catch (err) {
            cleanupErrors.push(`Firewall cleanup: ${err instanceof Error ? err.message : "Failed"}`);
        }

        if (vpc.mikrotikVlanIf) {
            try {
                const cidr = vpc.subnet.split("/")[1] || "28";
                await removeIpAddress(`${vpc.gateway}/${cidr}`, vpc.mikrotikVlanIf);
            } catch (err) {
                cleanupErrors.push(`IP removal: ${err instanceof Error ? err.message : "Failed"}`);
            }

            try {
                await deleteVlanInterface(vpc.mikrotikVlanIf);
            } catch (err) {
                cleanupErrors.push(`VLAN interface: ${err instanceof Error ? err.message : "Failed"}`);
            }
        }

        // ── Database ─────────────────────────────────────────────────
        await prisma.vpc.delete({ where: { id: vpcId } });

        void audit({
            userId,
            action: "VPC_DELETE",
            resourceType: "Network",
            resourceId: vpcId,
            metadata: { vlanId: vpc.vlanId, vnetName: vpc.vnetName, cleanupErrors },
            req,
        });

        return NextResponse.json({
            success: true,
            cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
        });
    } catch (error) {
        console.error("[networks/vpc] DELETE error:", error);
        return NextResponse.json(
            { error: "Failed to delete VPC" },
            { status: 500 },
        );
    }
}
