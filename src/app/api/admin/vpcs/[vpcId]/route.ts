import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
    deleteVlanInterface,
    removeIpAddress,
    removeFirewallRulesByComment,
} from "@/lib/mikrotik";

/**
 * GET /api/admin/vpcs/[vpcId] — Single VPC detail with assigned VMs.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ vpcId: string }> }
) {
    try {
        const session = await auth();
        const role = (session?.user as Record<string, unknown>)?.role;
        if (!session?.user?.id || role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { vpcId } = await params;

        const vpc = await prisma.vpc.findUnique({
            where: { id: vpcId },
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
                                ipAddress: true,
                                user: { select: { id: true, name: true, email: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!vpc) {
            return NextResponse.json({ error: "VPC not found" }, { status: 404 });
        }

        return NextResponse.json(vpc);
    } catch (error) {
        console.error("[vpcs] Detail error:", error);
        return NextResponse.json({ error: "Failed to load VPC" }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/vpcs/[vpcId] — Update VPC metadata.
 * Body: { name?, description?, status?, isolate? }
 */
export async function PATCH(
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
        const { name, description, status, isolate } = body as {
            name?: string;
            description?: string;
            status?: string;
            isolate?: boolean;
        };

        const data: Record<string, unknown> = {};
        if (name !== undefined) data.name = name;
        if (description !== undefined) data.description = description;
        if (status !== undefined) data.status = status;
        if (isolate !== undefined) data.isolate = isolate;

        const vpc = await prisma.vpc.update({
            where: { id: vpcId },
            data,
        });

        return NextResponse.json(vpc);
    } catch (error) {
        console.error("[vpcs] Update error:", error);
        return NextResponse.json({ error: "Failed to update VPC" }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/vpcs/[vpcId] — Delete VPC.
 *
 * Refuses if VMs are still assigned. Cleans up MikroTik resources:
 *   1. Remove firewall isolation rules (by comment)
 *   2. Remove gateway IP address
 *   3. Delete VLAN interface
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

        const vpc = await prisma.vpc.findUnique({
            where: { id: vpcId },
            include: { _count: { select: { assignments: true } } },
        });

        if (!vpc) {
            return NextResponse.json({ error: "VPC not found" }, { status: 404 });
        }

        if (vpc._count.assignments > 0) {
            return NextResponse.json(
                { error: `Cannot delete VPC with ${vpc._count.assignments} assigned VM(s). Unassign them first.` },
                { status: 409 }
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
            userId: session.user.id,
            action: "VPC_DELETE",
            resourceType: "Network",
            resourceId: vpcId,
            metadata: { vlanId: vpc.vlanId, vnetName: vpc.vnetName, cleanupErrors },
            req,
        });

        return NextResponse.json({ success: true, cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined });
    } catch (error) {
        console.error("[vpcs] Delete error:", error);
        return NextResponse.json({ error: "Failed to delete VPC" }, { status: 500 });
    }
}
