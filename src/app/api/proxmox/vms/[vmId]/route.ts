import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { startVM, stopVM, restartVM, getVMStatus, changeVMIso } from "@/lib/proxmox";
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

        // Verify ownership
        const instance = await prisma.vpsInstance.findFirst({
            where: { vmId, node, userId: session.user.id },
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

            case "reinstall":
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
