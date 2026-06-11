import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
    createVlanInterface,
    addIpAddress,
    createDhcpPool,
    createDhcpServer,
    createDhcpNetwork,
} from "@/lib/mikrotik";
import { createSdnVnet, createSdnSubnet, applySdnConfig } from "@/lib/proxmox";
import { allocateVlan, allocateVpcNet, VLAN_MIN, VLAN_MAX } from "@/lib/vpc-subnet";

const SDN_ZONE = process.env.PROXMOX_SDN_ZONE || "NRSPVLAN";
const CUSTOMER_TRUNK = process.env.MIKROTIK_CUSTOMER_TRUNK || "RTL-ether1-2.5G";

/**
 * GET /api/admin/vpcs — List all VPCs with assignment counts.
 */
export async function GET() {
    try {
        const session = await auth();
        const role = (session?.user as Record<string, unknown>)?.role;
        if (!session?.user?.id || role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const vpcs = await prisma.vpc.findMany({
            orderBy: { vlanId: "asc" },
            include: {
                user: { select: { id: true, name: true, email: true } },
                assignments: {
                    include: {
                        vpsInstance: {
                            select: {
                                id: true, vmId: true, name: true, status: true, node: true,
                                user: { select: { id: true, name: true, email: true } },
                            },
                        },
                    },
                },
                _count: { select: { assignments: true } },
            },
        });

        return NextResponse.json({ vpcs });
    } catch (error) {
        console.error("[vpcs] List error:", error);
        return NextResponse.json({ error: "Failed to list VPCs" }, { status: 500 });
    }
}

/**
 * POST /api/admin/vpcs — Create a VPC (new per-VLAN + DHCP model).
 *
 * Body: { name, userId?, vlanId?, description?, isolate? }
 *   - vlanId optional (1001-2000) — auto-allocated if omitted.
 *   - subnet is a /28 hashed from the owner id (or name) — never hand-entered.
 *   - userId optional owner; null = admin-managed VPC.
 *
 * Provisions: SDN VNet (VLAN tag) in the VLAN zone + MikroTik VLAN interface,
 * gateway IP, and a DHCP server/pool/network.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as Record<string, unknown>)?.role;
        if (!session?.user?.id || role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        const ownerId = typeof body?.userId === "string" && body.userId ? body.userId : null;
        const reqVlan = body?.vlanId != null ? Number(body.vlanId) : null;
        const description = typeof body?.description === "string" ? body.description : null;
        const isolate = body?.isolate !== false;

        if (!name || name.length < 2) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }
        if (reqVlan != null && (!Number.isInteger(reqVlan) || reqVlan < VLAN_MIN || reqVlan > VLAN_MAX)) {
            return NextResponse.json({ error: `VLAN ID must be ${VLAN_MIN}–${VLAN_MAX}` }, { status: 400 });
        }

        // ── Allocate VLAN tag + /28 ─────────────────────────────────
        const existing = await prisma.vpc.findMany({ select: { vlanId: true, networkIndex: true, name: true } });
        const usedVlans = new Set(existing.map((v) => v.vlanId));
        const usedIndexes = new Set(existing.map((v) => v.networkIndex).filter((i): i is number => i != null));

        if (existing.some((v) => v.name === name)) {
            return NextResponse.json({ error: "A VPC with this name already exists" }, { status: 409 });
        }

        let vlanId: number;
        let net;
        try {
            if (reqVlan != null) {
                if (usedVlans.has(reqVlan)) return NextResponse.json({ error: `VLAN ${reqVlan} is already in use` }, { status: 409 });
                vlanId = reqVlan;
            } else {
                vlanId = allocateVlan(usedVlans);
            }
            // Seed the /28 from the owner id when present, else the VPC name.
            net = allocateVpcNet(`${ownerId ?? name}:${vlanId}`, usedIndexes);
        } catch (e) {
            return NextResponse.json({ error: e instanceof Error ? e.message : "Allocation failed" }, { status: 503 });
        }

        const vnetName = `vc${vlanId}`;
        const vlanIfName = `vlan${vlanId}-cust`;
        const cmt = `NRSP-VPC-${net.networkId}`;
        const provisionErrors: string[] = [];

        // ── Proxmox SDN VNet + subnet ───────────────────────────────
        try {
            await createSdnVnet(vnetName, SDN_ZONE, vlanId, name);
            await createSdnSubnet(vnetName, net.subnet, net.gateway, false);
            await applySdnConfig();
        } catch (err) {
            provisionErrors.push(`SDN: ${err instanceof Error ? err.message : "Failed"}`);
        }

        // ── MikroTik VLAN iface + gateway + DHCP ────────────────────
        try {
            await createVlanInterface(vlanId, vlanIfName, CUSTOMER_TRUNK);
            await addIpAddress(`${net.gateway}/28`, vlanIfName, cmt);
            await createDhcpPool(cmt, `${net.dhcpStart}-${net.dhcpEnd}`, cmt);
            await createDhcpNetwork(net.subnet, net.gateway, "8.8.8.8,1.1.1.1", cmt);
            await createDhcpServer(cmt, vlanIfName, cmt, cmt);
        } catch (err) {
            provisionErrors.push(`MikroTik: ${err instanceof Error ? err.message : "Failed"}`);
        }

        // ── Database ─────────────────────────────────────────────────
        const vpc = await prisma.vpc.create({
            data: {
                userId: ownerId,
                name,
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
                description,
                isolate,
            },
        });

        void audit({
            userId: session.user.id,
            action: "VPC_CREATE",
            resourceType: "Network",
            resourceId: vpc.id,
            metadata: { vlanId, vnetName, subnet: net.subnet, gateway: net.gateway, ownerId, provisionErrors },
            req,
        });

        return NextResponse.json({
            vpc,
            mikrotikErrors: provisionErrors.length > 0 ? provisionErrors : undefined,
        }, { status: 201 });
    } catch (error) {
        console.error("[vpcs] Create error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create VPC" },
            { status: 500 }
        );
    }
}
