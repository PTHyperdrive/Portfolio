import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
    addIpAddress,
    removeIpAddress,
    createVlanInterface,
    deleteVlanInterface,
    createDhcpPool,
    createDhcpServer,
    createDhcpNetwork,
    removeDhcpByComment,
} from "@/lib/mikrotik";
import {
    createSdnVnet,
    createSdnSubnet,
    applySdnConfig,
    deleteSdnSubnet,
    deleteSdnVnet,
} from "@/lib/proxmox";
import {
    VPC_POOL_CIDR,
    allocateVpcNet,
    allocateVlan,
} from "@/lib/vpc-subnet";

// ─── Constants ───────────────────────────────────────────────────
// Per-user VLAN model: each VPC = its own SDN VNet (VLAN tag) + its own
// MikroTik VLAN interface, gateway, and DHCP server.
const SDN_ZONE = process.env.PROXMOX_SDN_ZONE || "NRSPVC"; // must be a VLAN-type zone on vmbr1
// Parent trunk on the MikroTik that carries the customer VLAN tags.
const CUSTOMER_TRUNK = process.env.MIKROTIK_CUSTOMER_TRUNK || "RTL-ether1-2.5G";
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

        // Customers only see subnet + gateway (+ DHCP per VM). VLAN tag, VNet
        // name, zone and /28 index are infrastructure details — admin only.
        const isAdmin = user?.role === "ADMIN";
        const visibleVpcs = isAdmin
            ? vpcs
            : vpcs.map(({ vlanId, vnetName, zoneName, mikrotikVlanIf, networkId, networkIndex, ...rest }) => {
                void vlanId; void vnetName; void zoneName; void mikrotikVlanIf; void networkId; void networkIndex;
                return rest;
            });

        return NextResponse.json({
            vpcs: visibleVpcs,
            unassignedVMs,
            maxVpcs: user?.maxVpcs ?? 3,
            isAdmin,
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

        // ── Allocate a per-user VLAN tag + a /28 hashed from the owner id ─
        const existing = await prisma.vpc.findMany({
            select: { vlanId: true, networkIndex: true },
        });
        const usedVlans = new Set(existing.map((v) => v.vlanId));
        const usedIndexes = new Set(
            existing.map((v) => v.networkIndex).filter((i): i is number => i != null),
        );

        let vlanId: number;
        let net;
        try {
            vlanId = allocateVlan(usedVlans);
            net = allocateVpcNet(`${userId}:${currentCount}`, usedIndexes);
        } catch (e) {
            return NextResponse.json(
                { error: e instanceof Error ? e.message : `Pool exhausted (${VPC_POOL_CIDR}).` },
                { status: 503 },
            );
        }

        const username = user?.name || user?.email?.split("@")[0] || "user";
        const vnetName = `vc${vlanId}`;
        const vlanIfName = `vlan${vlanId}-cust`;
        const cmt = `NRSP-VPC-${net.networkId}`;

        // ── Parallel provisioning: Proxmox SDN + MikroTik (gw + DHCP) ─
        const provisionErrors: string[] = [];

        await Promise.allSettled([
            // ── Group 1: Proxmox SDN — per-user VNet (VLAN tag) ──────
            (async () => {
                try {
                    await withTimeout(
                        createSdnVnet(vnetName, SDN_ZONE, vlanId, `${name.trim()} (${username})`),
                        PROVISION_TIMEOUT, "SDN VNet",
                    );
                } catch (err) {
                    provisionErrors.push(`SDN VNet: ${errMsg(err)}`);
                    return;
                }
                try {
                    // snat=false — MikroTik is the gateway/NAT for this VLAN.
                    await withTimeout(
                        createSdnSubnet(vnetName, net.subnet, net.gateway, false),
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

            // ── Group 2: MikroTik — VLAN iface + gateway + DHCP ──────
            (async () => {
                try {
                    await withTimeout(
                        createVlanInterface(vlanId, vlanIfName, CUSTOMER_TRUNK),
                        PROVISION_TIMEOUT, "VLAN interface",
                    );
                } catch (err) {
                    provisionErrors.push(`VLAN interface: ${errMsg(err)}`);
                    return; // no interface → skip gateway/DHCP
                }
                try {
                    await withTimeout(
                        addIpAddress(`${net.gateway}/28`, vlanIfName, cmt),
                        PROVISION_TIMEOUT, "IP address",
                    );
                } catch (err) {
                    provisionErrors.push(`IP address: ${errMsg(err)}`);
                }
                // DHCP server so customer VMs auto-assign from their /28.
                try {
                    await withTimeout(createDhcpPool(cmt, `${net.dhcpStart}-${net.dhcpEnd}`, cmt), PROVISION_TIMEOUT, "DHCP pool");
                    await withTimeout(createDhcpNetwork(net.subnet, net.gateway, "8.8.8.8,1.1.1.1", cmt), PROVISION_TIMEOUT, "DHCP network");
                    await withTimeout(createDhcpServer(cmt, vlanIfName, cmt, cmt), PROVISION_TIMEOUT, "DHCP server");
                } catch (err) {
                    provisionErrors.push(`DHCP: ${errMsg(err)}`);
                }
            })(),
        ]);

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
                vnetName,
                zoneName: SDN_ZONE,
                mikrotikVlanIf: vlanIfName,
                subnet: net.subnet,
                gateway: net.gateway,
                dhcpStart: net.dhcpStart,
                dhcpEnd: net.dhcpEnd,
                description: `${name.trim()} (${username})`,
            },
        });

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
        // Tear down this user's VLAN: DHCP, gateway IP, VLAN interface,
        // and the SDN VNet + subnet. Matched by the per-VPC comment.
        const cleanupErrors: string[] = [];
        const cmt = vpc.networkId ? `NRSP-VPC-${vpc.networkId}` : `NRSP-VPC-${vpc.vnetName}`;

        await Promise.allSettled([
            // ── Group 1: MikroTik cleanup ────────────────────────────
            (async () => {
                try {
                    await withTimeout(removeDhcpByComment(cmt), PROVISION_TIMEOUT, "DHCP cleanup");
                } catch (err) {
                    cleanupErrors.push(`DHCP cleanup: ${errMsg(err)}`);
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
                    try {
                        await withTimeout(deleteVlanInterface(vpc.mikrotikVlanIf), PROVISION_TIMEOUT, "VLAN interface");
                    } catch (err) {
                        cleanupErrors.push(`VLAN interface: ${errMsg(err)}`);
                    }
                }
            })(),

            // ── Group 2: Proxmox SDN cleanup (subnet + VNet) ─────────
            (async () => {
                const zone = vpc.zoneName || SDN_ZONE;
                try {
                    await withTimeout(deleteSdnSubnet(vpc.vnetName, zone, vpc.subnet), PROVISION_TIMEOUT, "SDN Subnet");
                } catch (err) {
                    cleanupErrors.push(`SDN Subnet: ${errMsg(err)}`);
                }
                try {
                    await withTimeout(deleteSdnVnet(vpc.vnetName), PROVISION_TIMEOUT, "SDN VNet");
                } catch (err) {
                    cleanupErrors.push(`SDN VNet: ${errMsg(err)}`);
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
