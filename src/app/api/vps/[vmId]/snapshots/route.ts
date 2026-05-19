import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { listSnapshots, createSnapshot, deleteSnapshot, rollbackSnapshot } from "@/lib/proxmox";

/** Validate snapshot name: must start with a letter, then alphanumeric/underscore/hyphen, 2-40 chars (Proxmox config ID format) */
function validSnapName(name: string): boolean {
    return /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(name);
}

async function getVmInstance(vmId: string, userId: string) {
    return prisma.vpsInstance.findFirst({
        where:  { vmId, userId },
        select: { id: true, vmId: true, node: true },
    });
}

/**
 * GET /api/vps/[vmId]/snapshots
 * List all snapshots for the VM.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { vmId } = await params;
    const instance = await getVmInstance(vmId, session.user.id);
    if (!instance) return NextResponse.json({ error: "VM not found." }, { status: 404 });

    try {
        const snapshots = await listSnapshots(instance.node, vmId);
        return NextResponse.json({ snapshots });
    } catch (err) {
        console.error("[snapshots] list error:", err);
        return NextResponse.json({ error: "Failed to fetch snapshots." }, { status: 502 });
    }
}

/**
 * POST /api/vps/[vmId]/snapshots
 * Create a new snapshot.
 * Body: { snapname: string, description?: string, includeRam?: boolean }
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId  = session.user.id;
    const { vmId } = await params;
    const instance = await getVmInstance(vmId, userId);
    if (!instance) return NextResponse.json({ error: "VM not found." }, { status: 404 });

    const body = await req.json() as { snapname?: string; description?: string; includeRam?: boolean };
    const { snapname, description = "", includeRam = false } = body;

    if (!snapname?.trim()) {
        return NextResponse.json({ error: "snapname is required." }, { status: 400 });
    }
    if (!validSnapName(snapname)) {
        return NextResponse.json(
            { error: "snapname must start with a letter and contain only alphanumeric/underscore/hyphen characters (max 40)." },
            { status: 400 }
        );
    }

    try {
        const upid = await createSnapshot(instance.node, vmId, snapname.trim(), description.trim(), includeRam);

        void audit({
            userId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            action:       "SNAPSHOT_CREATE" as any,
            resourceType: "VirtualMachine",
            resourceId:   vmId,
            metadata:     { snapname, description, includeRam, node: instance.node, upid },
            req,
        });

        return NextResponse.json({ success: true, snapname, upid });
    } catch (err) {
        console.error("[snapshots] create error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to create snapshot." },
            { status: 502 }
        );
    }
}

/**
 * DELETE /api/vps/[vmId]/snapshots
 * Delete a snapshot.
 * Body: { snapname: string, force?: boolean }
 *
 * PATCH /api/vps/[vmId]/snapshots
 * Rollback to a snapshot.
 * Body: { snapname: string }
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

    const body = await req.json() as { snapname?: string; force?: boolean };
    const { snapname, force = false } = body;

    if (!snapname?.trim()) {
        return NextResponse.json({ error: "snapname is required." }, { status: 400 });
    }

    try {
        const upid = await deleteSnapshot(instance.node, vmId, snapname.trim(), force);

        void audit({
            userId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            action:       "SNAPSHOT_DELETE" as any,
            resourceType: "VirtualMachine",
            resourceId:   vmId,
            metadata:     { snapname, force, upid },
            req,
        });

        return NextResponse.json({ success: true, upid });
    } catch (err) {
        console.error("[snapshots] delete error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to delete snapshot." },
            { status: 502 }
        );
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId   = session.user.id;
    const { vmId } = await params;
    const instance = await getVmInstance(vmId, userId);
    if (!instance) return NextResponse.json({ error: "VM not found." }, { status: 404 });

    const body = await req.json() as { snapname?: string };
    const { snapname } = body;

    if (!snapname?.trim()) {
        return NextResponse.json({ error: "snapname is required." }, { status: 400 });
    }

    try {
        const upid = await rollbackSnapshot(instance.node, vmId, snapname.trim());

        void audit({
            userId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            action:       "SNAPSHOT_ROLLBACK" as any,
            resourceType: "VirtualMachine",
            resourceId:   vmId,
            metadata:     { snapname, upid },
            req,
        });

        return NextResponse.json({ success: true, snapname, upid });
    } catch (err) {
        console.error("[snapshots] rollback error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to rollback snapshot." },
            { status: 502 }
        );
    }
}
