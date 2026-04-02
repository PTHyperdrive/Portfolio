import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createBackup, listBackups, deleteBackup, getAllNodesStorage } from "@/lib/proxmox";

/** Find backup-capable storage pools (content type includes "backup") */
async function getBackupStorages(node: string): Promise<string[]> {
    try {
        const { pveFetch } = await import("@/lib/proxmox");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await (pveFetch as any)(`/nodes/${node}/storage?content=backup`);
        return ((data as { storage: string; active: number; enabled: number }[]) ?? [])
            .filter(s => s.active === 1 && s.enabled === 1)
            .map(s => s.storage);
    } catch {
        return [];
    }
}

async function getVmInstance(vmId: string, userId: string) {
    return prisma.vpsInstance.findFirst({
        where:  { vmId, userId },
        select: { id: true, vmId: true, node: true },
    });
}

/**
 * GET /api/vps/[vmId]/backups?storage=<id>
 * List backups for the VM on the specified storage.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { vmId } = await params;
    const instance = await getVmInstance(vmId, session.user.id);
    if (!instance) return NextResponse.json({ error: "VM not found." }, { status: 404 });

    // Discover backup-capable storages on the node
    const storage = req.nextUrl.searchParams.get("storage");
    let storageList: string[];

    if (storage) {
        storageList = [storage];
    } else {
        storageList = await getBackupStorages(instance.node);
    }

    try {
        const results = await Promise.allSettled(
            storageList.map(s => listBackups(instance.node, s, vmId))
        );
        const backups = results
            .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof listBackups>>> => r.status === "fulfilled")
            .flatMap(r => r.value)
            .sort((a, b) => b.ctime - a.ctime);

        return NextResponse.json({ backups, storages: storageList });
    } catch (err) {
        return NextResponse.json({ error: "Failed to fetch backups." }, { status: 502 });
    }
}

/**
 * POST /api/vps/[vmId]/backups
 * Trigger a backup.
 * Body: { storage: string, notes?: string }
 *
 * Enforced: mode=snapshot, compress=zstd — not overrideable by client.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId   = session.user.id;
    const { vmId } = await params;
    const instance = await getVmInstance(vmId, userId);
    if (!instance) return NextResponse.json({ error: "VM not found." }, { status: 404 });

    const body = await req.json() as { storage?: string; notes?: string };
    const { storage, notes } = body;

    if (!storage?.trim()) {
        return NextResponse.json({ error: "storage is required." }, { status: 400 });
    }

    try {
        // createBackup enforces mode=snapshot and compress=zstd internally
        const upid = await createBackup(instance.node, vmId, storage.trim(), notes);

        void audit({
            userId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            action:       "BACKUP_CREATE" as any,
            resourceType: "VirtualMachine",
            resourceId:   vmId,
            metadata:     { storage, notes, node: instance.node, upid, mode: "snapshot", compress: "zstd" },
            req,
        });

        return NextResponse.json({
            success: true,
            upid,
            storage,
            // Equivalent CLI command for transparency
            cliEquivalent: `vzdump ${vmId} --storage ${storage} --mode snapshot --compress zstd`,
        });
    } catch (err) {
        console.error("[backups] create error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Backup failed." },
            { status: 502 }
        );
    }
}

/**
 * DELETE /api/vps/[vmId]/backups
 * Delete a backup archive.
 * Body: { volid: string }
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId   = session.user.id;
    const { vmId } = await params;
    const instance = await getVmInstance(vmId, userId);
    if (!instance) return NextResponse.json({ error: "VM not found." }, { status: 404 });

    const body = await req.json() as { volid?: string };
    if (!body.volid?.trim()) {
        return NextResponse.json({ error: "volid is required." }, { status: 400 });
    }

    // Verify the backup belongs to this VM (volid contains the vmid)
    if (!body.volid.includes(vmId)) {
        return NextResponse.json({ error: "Backup does not belong to this VM." }, { status: 403 });
    }

    try {
        const upid = await deleteBackup(instance.node, body.volid.trim());
        return NextResponse.json({ success: true, upid });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to delete backup." },
            { status: 502 }
        );
    }
}
