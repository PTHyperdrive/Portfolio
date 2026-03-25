import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
    stopVM,
    startVM,
    detachAndDeleteDisk,
    addDisk,
    changeVMIso,
} from "@/lib/proxmox";
import { getIsoById } from "@/lib/windows-isos";

/**
 * POST /api/proxmox/vms/[vmId]/reinstall
 *
 * Factory-resets a VM:
 *   1. Stop VM
 *   2. Delete current boot disk (scsi0)
 *   3. Re-allocate a fresh blank disk of the original plan size
 *   4. Mount the selected ISO on ide2
 *   5. Start VM (will boot into OS installer)
 *
 * Body: { node: string, isoId: string }
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
        const body = await req.json() as { node?: string; isoId?: string };
        const { node, isoId } = body;

        if (!node) return NextResponse.json({ error: "node is required" }, { status: 400 });
        if (!isoId) return NextResponse.json({ error: "isoId is required" }, { status: 400 });

        // Verify ownership
        const instance = await prisma.vpsInstance.findFirst({
            where: { vmId, node, userId: session.user.id },
        });

        if (!instance) {
            return NextResponse.json({ error: "VM not found or access denied" }, { status: 404 });
        }

        // Resolve ISO path
        const iso = getIsoById(isoId);
        if (!iso) {
            return NextResponse.json({ error: "Invalid ISO ID" }, { status: 400 });
        }

        // Get disk size from stored specs (fallback to 32 GB)
        const specs = instance.specs as Record<string, unknown> | null;
        const diskGb = (specs?.disk_gb as number) || 32;
        const storage = (specs?.storage as string) || "local-zfs";

        // Step 1: Stop VM (ignore if already stopped)
        try { await stopVM(node, vmId); } catch { /* already stopped */ }
        await new Promise((r) => setTimeout(r, 3000));

        // Step 2: Detach & delete current boot disk
        await detachAndDeleteDisk(node, vmId, "scsi0");

        // Step 3: Allocate a fresh blank disk
        await addDisk(node, vmId, storage, diskGb);

        // Step 4: Mount new ISO
        await changeVMIso(node, vmId, iso.iso);

        // Step 5: Update DB record
        await prisma.vpsInstance.update({
            where: { id: instance.id },
            data: {
                os: iso.name,
                status: "provisioning",
            },
        });

        // Step 6: Start VM → boots into ISO installer
        await startVM(node, vmId);
        await prisma.vpsInstance.update({
            where: { id: instance.id },
            data: { status: "running" },
        });

        return NextResponse.json({
            success: true,
            message: `VM ${vmId} wiped and reinstalling ${iso.name}. Use SPICE console to complete OS installation.`,
            vmId,
            iso: iso.name,
        });
    } catch (error) {
        console.error("Reinstall error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Reinstall failed" },
            { status: 500 }
        );
    }
}
