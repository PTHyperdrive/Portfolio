import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

/**
 * PATCH /api/admin/vms/[id]/assign
 *
 * Reassigns a VpsInstance (and its linked DeploymentTicket, if any)
 * from the current owner to a new user. Admin only.
 *
 * Body:
 *   { newUserId: string }
 *
 * Steps:
 *   1. Verify the VM exists.
 *   2. Verify the target user exists.
 *   3. In a single $transaction:
 *      a. Update VpsInstance.userId → newUserId
 *      b. If the VM has a linked DeploymentTicket, update its userId too.
 */
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error } = await requireAdmin();
        if (error) return error;

        // Get the admin's userId for audit
        const adminSession = await (await import("@/lib/auth")).auth();
        const adminUserId = adminSession?.user?.id;

        const { id } = await params;
        if (!id) {
            return NextResponse.json({ error: "VM ID is required" }, { status: 400 });
        }

        let body: Record<string, unknown> = {};
        try { body = await req.json(); } catch { /* empty body falls through to validation */ }

        const newUserId = (body.newUserId as string | undefined)?.trim();
        if (!newUserId) {
            return NextResponse.json({ error: "newUserId is required" }, { status: 400 });
        }

        // ── 1. Verify VM exists ───────────────────────────────────────
        const vm = await prisma.vpsInstance.findUnique({
            where: { id },
            select: { id: true, vmId: true, node: true, name: true, userId: true, ticketId: true },
        });

        if (!vm) {
            return NextResponse.json({ error: "VM not found" }, { status: 404 });
        }

        // ── 2. Verify target user exists ──────────────────────────────
        const targetUser = await prisma.user.findUnique({
            where:  { id: newUserId },
            select: { id: true, email: true, name: true },
        });

        if (!targetUser) {
            return NextResponse.json({ error: "Target user not found" }, { status: 404 });
        }

        if (vm.userId === newUserId) {
            return NextResponse.json({ error: "VM already belongs to this user" }, { status: 400 });
        }

        // ── 3. Atomic reassignment ────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txOps: any[] = [
            prisma.vpsInstance.update({
                where: { id },
                data:  { userId: newUserId },
            }),
        ];

        // Reassign the linked DeploymentTicket if one exists
        if (vm.ticketId) {
            txOps.push(
                prisma.deploymentTicket.update({
                    where: { id: vm.ticketId },
                    data:  { userId: newUserId },
                })
            );
        }

        await prisma.$transaction(txOps);

        // ISO 27001: Audit admin VM reassignment
        if (adminUserId) {
            void audit({
                userId: adminUserId,
                action: "ADMIN_VM_ASSIGN",
                resourceType: "VirtualMachine",
                resourceId: vm.vmId,
                metadata: {
                    previousOwner: vm.userId,
                    newOwner: newUserId,
                    vmName: vm.name,
                    ticketReassigned: !!vm.ticketId,
                },
                req,
            });
        }

        return NextResponse.json({
            success:    true,
            vmId:       vm.vmId,
            vmName:     vm.name,
            assignedTo: { id: targetUser.id, email: targetUser.email, name: targetUser.name },
            ticketReassigned: !!vm.ticketId,
        });
    } catch (error) {
        console.error("Admin VM assign error:", error);
        return NextResponse.json({ error: "Failed to reassign VM" }, { status: 500 });
    }
}
