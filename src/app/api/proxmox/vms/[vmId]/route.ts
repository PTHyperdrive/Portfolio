import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { startVM, stopVM, restartVM, resetVM, shutdownVM, getVMStatus, changeVMIso } from "@/lib/proxmox";
import { getIsoById } from "@/lib/windows-isos";
import { audit } from "@/lib/audit";

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
            const raw = await getVMStatus(instance.node, vmId) as Record<string, unknown>;
            // Normalize Proxmox field names → frontend interface
            liveData = {
                status:  raw.status  ?? "unknown",
                uptime:  raw.uptime  ?? 0,
                cpu:     raw.cpu     ?? 0,
                memory:  raw.mem     ?? 0,   // Proxmox: `mem` (bytes)
                maxmem:  raw.maxmem  ?? 0,
                disk:    raw.disk    ?? 0,
                maxdisk: raw.maxdisk ?? 0,
                netin:   raw.netin   ?? 0,
                netout:  raw.netout  ?? 0,
            };
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

            case "stop":          // hard power-off (status/stop)
                await stopVM(node, vmId);
                await prisma.vpsInstance.update({ where: { id: instance.id }, data: { status: "stopped" } });
                break;

            case "shutdown":      // graceful ACPI shutdown
                try {
                    await shutdownVM(node, vmId);
                } catch (e) {
                    // Already off / spammed — treat "not running" as success.
                    if (!/not running/i.test(e instanceof Error ? e.message : "")) throw e;
                }
                await prisma.vpsInstance.update({ where: { id: instance.id }, data: { status: "stopped" } });
                break;

            case "restart":       // graceful reboot
            case "reset": {       // hard reset (power-cycle)
                try {
                    await (action === "reset" ? resetVM(node, vmId) : restartVM(node, vmId));
                } catch (e) {
                    // Clicking restart repeatedly hits Proxmox mid-reboot, which
                    // returns "VM NNN not running". That just means the reboot is
                    // already in progress — report it as such instead of a 500.
                    const msg = e instanceof Error ? e.message : "";
                    if (/not running/i.test(msg)) {
                        return NextResponse.json({ success: true, action, vmId, message: "VM is already restarting." });
                    }
                    throw e;
                }
                break;
            }

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

        // ISO 27001: Audit VM action
        const actionMap: Record<string, "VM_START" | "VM_STOP" | "VM_REBOOT" | "VM_REINSTALL"> = {
            start: "VM_START", stop: "VM_STOP", shutdown: "VM_STOP",
            restart: "VM_REBOOT", reset: "VM_REBOOT", reinstall: "VM_REINSTALL",
        };
        const auditAction = actionMap[action];
        if (auditAction) {
            void audit({
                userId: session.user.id,
                action: auditAction,
                resourceType: "VirtualMachine",
                resourceId: vmId,
                metadata: { node, action },
                req,
            });
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
