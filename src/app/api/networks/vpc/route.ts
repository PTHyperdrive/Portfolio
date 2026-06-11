import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
    addIpAddress,
    addFirewallIsolationRule,
    removeIpAddress,
    removeFirewallRulesByComment,
} from "@/lib/mikrotik";
import {
    createSdnVnet,
    createSdnSubnet,
    applySdnConfig,
    deleteSdnSubnet,
} from "@/lib/proxmox";
import {
    CUSTOMER_VLAN_ID,
    VPC_POOL_CIDR,
    allocateVpcNet,
} from "@/lib/vpc-subnet";

// ─── Constants ───────────────────────────────────────────────────
const SDN_ZONE = process.env.PROXMOX_SDN_ZONE || "NRSPVC";
// All customer VPCs share ONE SDN VNet (tag 50) and ONE MikroTik VLAN iface.
const SHARED_VNET = process.env.PROXMOX_VPC_VNET || "vmcust50";
// L3 gateways must live on the BRIDGE (br-vlan50), not the vlan50-customers
// slave port — Proxmox Timox-1 VMs arrive via RTL-ether1-2.5G into br-vlan50.
const CUSTOMER_VLAN_IF = process.env.MIKROTIK_CUSTOMER_VLAN_IF || "br-vlan50";
const PROVISION_TIMEOUT = 10_000; // 10s per infrastructure call

// ─── Helpers ─────────────────────────────────────────────────────

/** Wrap a promise with a timeout. Rejects with a descriptive error. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`${label} timed out (${ms / 1000}s)`)),
            ms,
        );
        promise
            .then((v) => { clearTimeout(timer); resolve(v); })
            .catch((e) => { clearTimeout(timer); reject(e); });
    });
}

/** Format an error for the provisionErrors array. */
function errMsg(err: unknown): string {
    return err instanceof Error ? err.message : "Failed";
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
 * Provisioning runs Proxmox SDN and MikroTik **in parallel**,
 * each with a 10s per-call timeout. Total worst-case: ~30s → ~10s.
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

        // ── Allocate a /28 hashed from the owner id ──────────────────
        // VLAN is fixed at 50; the subnet is derived from a hash of the
        // user id (per-VPC seed) with linear probing against taken blocks.
        const usedRows = await prisma.vpc.findMany({
            where: { networkIndex: { not: null } },
            select: { networkIndex: true },
        });
        const usedIndexes = new Set(usedRows.map((v) => v.networkIndex as number));

        let net;
        try {
            net = allocateVpcNet(`${userId}:${currentCount}`, usedIndexes);
        } catch {
            return NextResponse.json(
                { error: `VPC subnet pool exhausted (${VPC_POOL_CIDR}). Contact an administrator.` },
                { status: 503 },
            );
        }

        const vlanId = CUSTOMER_VLAN_ID;
        const username = user?.name || user?.email?.split("@")[0] || "user";
        const mikrotikComment = `NRSP-VPC-${net.networkId}`;
        const isolationComment = `NRSP-VPC-${net.networkId}-isolation`;

        // ── Parallel provisioning: Proxmox SDN + MikroTik ────────────
        const provisionErrors: string[] = [];

        await Promise.allSettled([
            // ── Group 1: Proxmox SDN — add this /28 to the shared VNet ─
            (async () => {
                // Ensure the shared VNet exists (idempotent — ignore "exists").
                try {
                    await withTimeout(
                        createSdnVnet(SHARED_VNET, SDN_ZONE, vlanId, "NRSP Customer VPCs (VLAN 50)"),
                        PROVISION_TIMEOUT, "SDN VNet",
                    );
                } catch (err) {
                    const m = errMsg(err);
                    if (!/exist/i.test(m)) provisionErrors.push(`SDN VNet: ${m}`);
                }

                try {
                    // snat=false — MikroTik (vlan50 gateway) does the routing/NAT.
                    await withTimeout(
                        createSdnSubnet(SHARED_VNET, net.subnet, net.gateway, false),
                        PROVISION_TIMEOUT, "SDN Subnet",
                    );
                } catch (err) {
                    provisionErrors.push(`SDN Subnet: ${errMsg(err)}`);
                }

                try {
                    await withTimeout(applySdnConfig(), PROVISION_TIMEOUT, "SDN Apply");
                } catch (err) {
                    provisionErrors.push(`SDN Apply: ${errMsg(err)}`);
                }
            })(),

            // ── Group 2: MikroTik — gateway IP on the shared vlan50 iface ─
            (async () => {
                try {
                    await withTimeout(
                        addIpAddress(`${net.gateway}/28`, CUSTOMER_VLAN_IF, mikrotikComment),
                        PROVISION_TIMEOUT, "IP address",
                    );
                } catch (err) {
                    provisionErrors.push(`IP address: ${errMsg(err)}`);
                }

                // Isolate this /28 from every other customer /28 (forward drop).
                try {
                    await withTimeout(
                        addFirewallIsolationRule(net.subnet, VPC_POOL_CIDR, isolationComment),
                        PROVISION_TIMEOUT, "Firewall rule",
                    );
                } catch (err) {
                    provisionErrors.push(`Firewall rule: ${errMsg(err)}`);
                }
            })(),
        ]);

        // Log provision errors server-side for debugging
        if (provisionErrors.length > 0) {
            console.warn("[networks/vpc] Provision warnings:", provisionErrors);
        }

        // ── Database ─────────────────────────────────────────────────
        const vpc = await prisma.vpc.create({
            data: {
                userId,
                name: name.trim(),
                vlanId,
                networkId: net.networkId,
                networkIndex: net.index,
                vnetName: SHARED_VNET,
                zoneName: SDN_ZONE,
                mikrotikVlanIf: CUSTOMER_VLAN_IF,
                subnet: net.subnet,
                gateway: net.gateway,
                dhcpStart: net.dhcpStart,
                dhcpEnd: net.dhcpEnd,
                description: `${name.trim()} (${username})`,
            },
        });

        // Audit
        void audit({
            userId,
            action: "VPC_CREATE",
            resourceType: "Network",
            resourceId: vpc.id,
            metadata: { vlanId, networkId: net.networkId, subnet: net.subnet, gateway: net.gateway, provisionErrors },
            req,
        });

        return NextResponse.json(
            { vpc, provisionErrors: provisionErrors.length > 0 ? provisionErrors : undefined },
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
 * Cleanup runs MikroTik and Proxmox SDN **in parallel**.
 * Uses deleteMany to avoid P2025 if the record was already removed.
 * Refuses if VMs are still assigned.
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

        // ── Parallel cleanup: MikroTik + Proxmox SDN ─────────────────
        // NOTE: the shared VNet and the vlan50-customers interface are NEVER
        // torn down — only this VPC's /28 gateway IP, isolation rule, and
        // SDN subnet are removed.
        const cleanupErrors: string[] = [];
        const isoComment = vpc.networkId
            ? `NRSP-VPC-${vpc.networkId}-isolation`
            : `NRSP-VPC-${vpc.vnetName}-isolation`; // legacy fallback

        await Promise.allSettled([
            // ── Group 1: MikroTik cleanup ────────────────────────────
            (async () => {
                try {
                    await withTimeout(
                        removeFirewallRulesByComment(isoComment),
                        PROVISION_TIMEOUT, "Firewall cleanup",
                    );
                } catch (err) {
                    cleanupErrors.push(`Firewall cleanup: ${errMsg(err)}`);
                }

                if (vpc.mikrotikVlanIf) {
                    try {
                        const cidr = vpc.subnet.split("/")[1] || "28";
                        await withTimeout(
                            removeIpAddress(`${vpc.gateway}/${cidr}`, vpc.mikrotikVlanIf),
                            PROVISION_TIMEOUT, "IP removal",
                        );
                    } catch (err) {
                        cleanupErrors.push(`IP removal: ${errMsg(err)}`);
                    }
                }
            })(),

            // ── Group 2: Proxmox SDN cleanup (subnet only) ───────────
            (async () => {
                const zone = vpc.zoneName || SDN_ZONE;

                try {
                    await withTimeout(
                        deleteSdnSubnet(vpc.vnetName, zone, vpc.subnet),
                        PROVISION_TIMEOUT, "SDN Subnet",
                    );
                } catch (err) {
                    cleanupErrors.push(`SDN Subnet: ${errMsg(err)}`);
                }

                try {
                    await withTimeout(applySdnConfig(), PROVISION_TIMEOUT, "SDN Apply");
                } catch (err) {
                    cleanupErrors.push(`SDN Apply: ${errMsg(err)}`);
                }
            })(),
        ]);

        if (cleanupErrors.length > 0) {
            console.warn("[networks/vpc] Cleanup warnings:", cleanupErrors);
        }

        // ── Database (P2025-safe) ────────────────────────────────────
        await prisma.vpc.deleteMany({ where: { id: vpcId } });

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
