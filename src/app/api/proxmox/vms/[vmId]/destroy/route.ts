import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { destroyVM } from "@/lib/proxmox";
import { verifyPassword } from "@/lib/security";
import { audit } from "@/lib/audit";
import { releaseGpu } from "@/lib/gpu-allocator";


/**
 * POST /api/proxmox/vms/[vmId]/destroy
 *
 * Destroys the VM in Proxmox, removes the DB record, and releases
 * the associated DeploymentTicket back to AVAILABLE so the user can
 * re-deploy for free within the original validity window.
 */
export async function POST(req: Request, { params }: { params: Promise<{ vmId: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { vmId } = await params;
        const { password, node } = await req.json() as { password?: string; node?: string };

        if (!password) {
            return NextResponse.json({ error: "Password is required to destroy an instance" }, { status: 400 });
        }
        if (!node) {
            return NextResponse.json({ error: "Node is required" }, { status: 400 });
        }

        // 1. Verify ownership — load ticket + GPU relation
        const instance = await prisma.vpsInstance.findFirst({
            where: { vmId, userId: session.user.id },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            select: { id: true, ticketId: true, gpuNodeId: true } as any,
        }) as { id: string; ticketId: string | null; gpuNodeId: string | null } | null;

        if (!instance) {
            return NextResponse.json({ error: "VPS Instance not found or access denied" }, { status: 404 });
        }

        // 2. Verify account password
        const user = await prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { passwordHash: true },
        });

        if (!user?.passwordHash) {
            return NextResponse.json({ error: "Server configuration error (no password hash found)" }, { status: 500 });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
            return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
        }

        // 3. Destroy VM in Proxmox
        try {
            await destroyVM(node, vmId);
        } catch (proxmoxErr: unknown) {
            console.error("Proxmox destroy error:", proxmoxErr);
            const msg = proxmoxErr instanceof Error ? proxmoxErr.message : String(proxmoxErr);
            // Allow "already deleted" errors through so we still clean up DB
            if (!msg.includes("does not exist") && !msg.includes("404")) {
                return NextResponse.json({ error: `Proxmox error: ${msg}` }, { status: 500 });
            }
        }

        // 3a. Release GPU VRAM (if this was a GPU-backed VM)
        // Done before DB cleanup so a partial DB error doesn’t strand VRAM.
        const gpuNodeId = instance.gpuNodeId;
        if (gpuNodeId) {
            try {
                await releaseGpu(gpuNodeId);
                void audit({
                    userId: session.user.id,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    action: "VM_GPU_RELEASE" as any,
                    resourceType: "VirtualMachine",
                    resourceId: vmId,
                    metadata: { gpuNodeId, node },
                    req,
                });
            } catch (gpuErr) {
                // Non-fatal: log but continue with DB cleanup
                console.error("[destroy] GPU release failed:", gpuErr);
            }
        }

        // 4. DB cleanup — delete VM record and release ticket back to AVAILABLE
        const ops: Prisma.PrismaPromise<unknown>[] = [
            prisma.vpsInstance.delete({ where: { id: instance.id } }),
        ];

        if (instance.ticketId) {
            // Check ticket is still valid before releasing it
            const ticket = await prisma.deploymentTicket.findUnique({
                where:  { id: instance.ticketId },
                select: { id: true, validUntil: true },
            });

            if (ticket && ticket.validUntil > new Date()) {
                ops.push(
                    prisma.deploymentTicket.update({
                        where: { id: ticket.id },
                        data:  { status: "AVAILABLE" },
                    })
                );
            }
            // If ticket is expired, leave it — user cannot re-deploy for free
        }

        await prisma.$transaction(ops);

        const ticketReleased = !!instance.ticketId;

        // ISO 27001: Audit VM destruction
        void audit({
            userId: session.user.id,
            action: "VM_DESTROY",
            resourceType: "VirtualMachine",
            resourceId: vmId,
            metadata: { node, ticketReleased },
            req,
        });

        return NextResponse.json({
            success: true,
            ticketReleased,
            message: ticketReleased
                ? "VM destroyed. Your deployment ticket has been released — you may re-deploy for free before it expires."
                : "Instance destroyed completely.",
        });
    } catch (error) {
        console.error("Destroy VM error:", error);
        return NextResponse.json({ error: "Failed to destroy VM" }, { status: 500 });
    }
}
