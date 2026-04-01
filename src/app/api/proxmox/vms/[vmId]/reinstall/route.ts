import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
    stopVM,
    startVM,
    waitForVMStopped,
    detectPrimaryDisk,
    detachAndDeleteDisk,
    addDisk,
    changeVMIso,
    setBootOrder,
    getAllNodesStorage,
    selectBestStorage,
} from "@/lib/proxmox";
import { getIsoById } from "@/lib/windows-isos";
import { audit } from "@/lib/audit";

/**
 * POST /api/proxmox/vms/[vmId]/reinstall
 *
 * Factory-resets a VM:
 *   1. Stop VM and poll until confirmed stopped
 *   2. Detect existing primary disk slot (sata0 / scsi0 / virtio0 / ide0)
 *   3. Delete old disk volume from storage pool (no Unused Disk leak)
 *   4. Allocate a fresh sata0 disk (maximum OS compatibility, no driver injection)
 *   5. Mount requested ISO on ide2, set boot order: sata0 → ide2
 *   6. Start VM (boots into OS installer)
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

        // Get disk size + storage from persisted specs
        const specs          = instance.specs as Record<string, unknown> | null;
        const diskGb         = (specs?.disk_gb as number)  || 32;
        const storageKeyword = (specs?.storageKeyword as string) || "";
        // Re-run pool selection to pick the best-available pool of the same type.
        // Falls back to the originally provisioned pool name (handles old instances
        // that pre-date storageKeyword persistence).
        let storage = (specs?.storage as string) || "local-zfs";
        if (storageKeyword) {
            const allPools = await getAllNodesStorage();
            const isNvme   = storageKeyword.toLowerCase().includes("nvme");
            const best     = selectBestStorage(allPools, storageKeyword, isNvme);
            if (best) storage = best.storage;
        }

        // Step 1: Stop VM, then poll until Proxmox confirms stopped.
        // Blind sleep is insufficient — disk ops on a running VM cause corruption.
        try { await stopVM(node, vmId); } catch { /* already stopped — continue */ }
        await waitForVMStopped(node, vmId, 60_000);

        // Step 2: Detect the primary disk slot dynamically.
        // Legacy VMs may be on scsi0 or virtio0; newer ones use sata0.
        const oldDiskKey = await detectPrimaryDisk(node, vmId);
        if (!oldDiskKey) {
            return NextResponse.json(
                { error: "Could not detect a primary disk on this VM. Reinstall aborted." },
                { status: 422 }
            );
        }

        // Step 3: Fully delete the old volume from storage (prevents Unused Disk leak).
        await detachAndDeleteDisk(node, vmId, oldDiskKey);

        // Step 4: Allocate fresh sata0 disk — works out-of-the-box on all OSes.
        await addDisk(node, vmId, storage, diskGb);

        // Step 5: Mount new ISO on ide2 and set boot order: sata0 → ide2.
        await changeVMIso(node, vmId, iso.iso);
        await setBootOrder(node, vmId);

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

        // ISO 27001: Audit VM reinstall
        void audit({
            userId: session.user.id,
            action: "VM_REINSTALL",
            resourceType: "VirtualMachine",
            resourceId: vmId,
            metadata: { node, isoId, isoName: iso.name, diskGb, storage },
            req,
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
