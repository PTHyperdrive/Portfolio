import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
    createVlanInterface,
    addIpAddress,
    addFirewallIsolationRule,
} from "@/lib/mikrotik";

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
                assignments: {
                    include: {
                        vpsInstance: {
                            select: {
                                id: true,
                                vmId: true,
                                name: true,
                                status: true,
                                node: true,
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
 * POST /api/admin/vpcs — Create a new VPC.
 *
 * Body: { name, vlanId, subnet, gateway, dhcpStart?, dhcpEnd?, description?, isolate? }
 *
 * Side effects:
 *   1. Creates VLAN interface on MikroTik
 *   2. Adds gateway IP to the VLAN interface
 *   3. Adds firewall isolation rule (drop forward between this VPC and management)
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as Record<string, unknown>)?.role;
        if (!session?.user?.id || role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const {
            name,
            vlanId,
            subnet,
            gateway,
            dhcpStart,
            dhcpEnd,
            description,
            isolate = true,
        } = body as {
            name: string;
            vlanId: number;
            subnet: string;
            gateway: string;
            dhcpStart?: string;
            dhcpEnd?: string;
            description?: string;
            isolate?: boolean;
        };

        // Validate VLAN range
        if (!vlanId || vlanId < 501 || vlanId > 1000) {
            return NextResponse.json(
                { error: "VLAN ID must be between 501 and 1000" },
                { status: 400 }
            );
        }

        // Check uniqueness
        const existing = await prisma.vpc.findFirst({
            where: { OR: [{ vlanId }, { name }] },
        });
        if (existing) {
            return NextResponse.json(
                { error: `VPC with ${existing.vlanId === vlanId ? "VLAN ID" : "name"} already exists` },
                { status: 409 }
            );
        }

        // Generate Proxmox VNet name: vc501, vc502, ... based on VLAN ID
        const vnetName = `vc${vlanId}`;
        const vlanIfName = `vlan${vlanId}`;

        // ── MikroTik provisioning ────────────────────────────────────
        let mikrotikVlanIf: string | null = null;
        const mikrotikErrors: string[] = [];

        try {
            await createVlanInterface(vlanId, vlanIfName);
            mikrotikVlanIf = vlanIfName;
        } catch (err) {
            mikrotikErrors.push(
                `VLAN interface: ${err instanceof Error ? err.message : "Failed"}`
            );
        }

        try {
            // Add gateway IP — format: "10.50.1.1/28"
            const cidr = subnet.split("/")[1] || "28";
            await addIpAddress(`${gateway}/${cidr}`, vlanIfName, `VPC ${name} gateway`);
        } catch (err) {
            mikrotikErrors.push(
                `IP address: ${err instanceof Error ? err.message : "Failed"}`
            );
        }

        try {
            // Isolation: drop forward from this VPC subnet to management (10.0.0.0/23)
            await addFirewallIsolationRule(
                subnet,
                "10.0.0.0/23",
                `NRSP-VPC-${vnetName}-isolation`
            );
        } catch (err) {
            mikrotikErrors.push(
                `Firewall rule: ${err instanceof Error ? err.message : "Failed"}`
            );
        }

        // ── Database ─────────────────────────────────────────────────
        const vpc = await prisma.vpc.create({
            data: {
                name,
                vlanId,
                vnetName,
                mikrotikVlanIf,
                subnet,
                gateway,
                dhcpStart: dhcpStart || null,
                dhcpEnd: dhcpEnd || null,
                description: description || null,
                isolate,
            },
        });

        // Audit
        void audit({
            userId: session.user.id,
            action: "VPC_CREATE",
            resourceType: "Network",
            resourceId: vpc.id,
            metadata: { vlanId, vnetName, subnet, gateway, mikrotikErrors },
            req,
        });

        return NextResponse.json({
            vpc,
            mikrotikErrors: mikrotikErrors.length > 0 ? mikrotikErrors : undefined,
        }, { status: 201 });
    } catch (error) {
        console.error("[vpcs] Create error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create VPC" },
            { status: 500 }
        );
    }
}
