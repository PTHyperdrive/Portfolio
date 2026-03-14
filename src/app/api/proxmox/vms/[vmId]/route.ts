import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { startVM, stopVM, restartVM, getVMStatus, changeVMIso, deleteVM } from "@/lib/proxmox";
import { getIsoById } from "@/lib/windows-isos";

/**
 * GET /api/proxmox/vms/[vmId] — Get VM detail with live data
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { vmId } = await params;

        const instance = await prisma.vpsInstance.findFirst({
            where: { vmId, userId: session.user.id },
        });

        if (!instance) {
            return NextResponse.json({ error: "VM not found" }, { status: 404 });
        }

        // Get live status from Proxmox
        let liveData = null;
        try {
            liveData = await getVMStatus(instance.node, vmId);
        } catch {
            // Proxmox unreachable
        }

        return NextResponse.json({
            ...instance,
            specs: instance.specs as Record<string, unknown> | null,
            liveData,
        });
    } catch (error) {
        console.error("VM detail error:", error);
        return NextResponse.json({ error: "Failed to load VM" }, { status: 500 });
    }
}

/**
 * POST /api/proxmox/vms/[vmId] — Execute VM action (start/stop/restart/reinstall)
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { vmId } = await params;
        const body = await req.json();
        const { action, node, isoId } = body;

        // Verify ownership (admin can control any VM)
        const isAdmin = (session.user as { role?: string }).role === "ADMIN";
        const instance = await prisma.vpsInstance.findFirst({
            where: isAdmin ? { vmId, node } : { vmId, node, userId: session.user.id },
        });

        if (!instance) {
            return NextResponse.json({ error: "VM not found or not yours" }, { status: 403 });
        }

        switch (action) {
            case "start":
                await startVM(node, vmId);
                await prisma.vpsInstance.update({ where: { id: instance.id }, data: { status: "running" } });
                break;

            case "stop":
                await stopVM(node, vmId);
                await prisma.vpsInstance.update({ where: { id: instance.id }, data: { status: "stopped" } });
                break;

            case "restart":
                await restartVM(node, vmId);
                break;

            case "reinstall": {
                if (!isoId) {
                    return NextResponse.json({ error: "ISO ID is required" }, { status: 400 });
                }
                const iso = getIsoById(isoId);
                if (!iso) {
                    return NextResponse.json({ error: "Invalid ISO ID" }, { status: 400 });
                }
                // Stop VM first, change ISO, then start
                try { await stopVM(node, vmId); } catch { /* may already be stopped */ }
                await changeVMIso(node, vmId, iso.iso);
                await prisma.vpsInstance.update({
                    where: { id: instance.id },
                    data: { os: iso.name, status: "provisioning" },
                });
                // Start VM to boot from new ISO
                await startVM(node, vmId);
                await prisma.vpsInstance.update({ where: { id: instance.id }, data: { status: "running" } });
                break;
            }

            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        return NextResponse.json({ success: true, action, vmId });
    } catch (error) {
        console.error("VM action error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Action failed" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/proxmox/vms/[vmId]
 *
 * Destroys a VM from Proxmox VE and removes it from the database.
 * Admin: can delete any VM.
 * User: can only delete their own VMs.
 *
 * Body: { node: string, force?: boolean }
 *   force=true stops the VM first before deleting (default true)
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { vmId } = await params;
        const body = await req.json().catch(() => ({}));
        const { node, force = true } = body as { node: string; force?: boolean };

        if (!node) {
            return NextResponse.json({ error: "node is required" }, { status: 400 });
        }

        // Verify ownership — admin can delete any VM
        const isAdmin = (session.user as { role?: string }).role === "ADMIN";
        const instance = await prisma.vpsInstance.findFirst({
            where: isAdmin ? { vmId, node } : { vmId, node, userId: session.user.id },
        });

        if (!instance) {
            return NextResponse.json({ error: "VM not found or not yours" }, { status: 404 });
        }

        // Step 1: Force-stop the VM if requested (ignore errors — it may already be stopped)
        if (force) {
            try {
                await stopVM(node, vmId);
                // Give PVE a moment to halt the VM before destroying
                await new Promise((r) => setTimeout(r, 3000));
            } catch {
                // Already stopped — continue
            }
        }

        // Step 2: Delete the VM from Proxmox (purge disks)
        await deleteVM(node, vmId, true);

        // Step 3: Remove from our database
        await prisma.vpsInstance.delete({ where: { id: instance.id } });

        return NextResponse.json({
            success: true,
            message: `VM ${vmId} (${instance.name}) has been destroyed and removed.`,
        });

    } catch (error) {
        console.error("[delete_vm] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Delete failed" },
            { status: 500 }
        );
    }
}
