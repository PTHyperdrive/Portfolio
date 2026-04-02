import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getAllNodesStorage, selectBestStorage, getVMConfig, updateVMConfig } from "@/lib/proxmox";
import { STORAGE_PRICING, type StorageType } from "@/lib/nextcloud";

/** Phase 1 block disk bus — SATA (AHCI), consistent with primary OS disk policy */
const DISK_BUS = "sata";

/**
 * Find the next free SATA slot on a VM.
 * sata0 = OS disk (reserved). Extra data disks: sata1 … sata5.
 * Returns null if all 5 extra slots are occupied.
 */
async function getNextFreeDiskSlot(
    node: string,
    vmId: string
): Promise<string | null> {
    const config = await getVMConfig(node, vmId);
    for (let i = 1; i <= 5; i++) {
        if (!config[`${DISK_BUS}${i}`]) return `${DISK_BUS}${i}`;
    }
    return null;
}

/**
 * GET /api/vps/[vmId]/storage
 *
 * Returns Phase 1 block storage addons for this VM, current disk slot usage,
 * and per-tier pricing for the frontend slider.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { vmId } = await params;

    const instance = await prisma.vpsInstance.findFirst({
        where:  { vmId, userId: session.user.id },
        select: { id: true, vmId: true, node: true, specs: true },
    });
    if (!instance) {
        return NextResponse.json({ error: "VM not found." }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addons: any[] = await (prisma as any).vmBlockStorageAddon.findMany({
        where:   { vpsInstanceId: instance.id, active: true },
        orderBy: { purchasedAt: "asc" },
        select: {
            id:          true,
            storageType: true,
            storagePool: true,
            diskSlot:    true,
            sizeGb:      true,
            pricePerGb:  true,
            totalCost:   true,
            purchasedAt: true,
        },
    });

    const totalExtraGb = addons.reduce(
        (s: number, a: { sizeGb: number }) => s + a.sizeGb,
        0
    );

    // Count free slots
    const usedSlots = addons.length; // each addon = one disk slot
    const freeSlots = 5 - usedSlots;

    return NextResponse.json({
        vmId,
        node:          instance.node,
        addons,
        totalExtraGb,
        usedSlots,
        freeSlots,
        // Slider constraints
        limits:        { min: 10, max: 2000, step: 10 },
        pricing:       STORAGE_PRICING,
    });
}

/**
 * POST /api/vps/[vmId]/storage
 *
 * Purchase + attach an extra Proxmox block disk to a VM.
 * Body: { storageType: "nvme" | "sata" | "hdd", sizeGb: number }
 *
 * Flow:
 *  1. Validate ownership + inputs
 *  2. Find best Proxmox pool for the storage tier
 *  3. Find next free SATA disk slot (sata1–sata5)
 *  4. Deduct credits + persist addon (atomic DB transaction)
 *  5. Attach disk via Proxmox API (PUT /config → {sata1: "pool:size"})
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { vmId } = await params;
    const body = await req.json() as { storageType?: string; sizeGb?: number };
    const { storageType, sizeGb } = body;

    // ── Input validation ───────────────────────────────────────────
    const validTypes: StorageType[] = ["nvme", "sata", "hdd"];
    if (!storageType || !validTypes.includes(storageType as StorageType)) {
        return NextResponse.json(
            { error: `storageType must be one of: ${validTypes.join(", ")}.` },
            { status: 400 }
        );
    }
    if (
        typeof sizeGb !== "number" ||
        !Number.isInteger(sizeGb) ||
        sizeGb < 10 ||
        sizeGb > 2000
    ) {
        return NextResponse.json(
            { error: "sizeGb must be an integer between 10 and 2000." },
            { status: 400 }
        );
    }

    const type = storageType as StorageType;

    // ── Ownership check ────────────────────────────────────────────
    const instance = await prisma.vpsInstance.findFirst({
        where:  { vmId, userId },
        select: { id: true, vmId: true, node: true },
    });
    if (!instance) {
        return NextResponse.json({ error: "VM not found." }, { status: 404 });
    }

    // ── Find best storage pool ─────────────────────────────────────
    const allPools = await getAllNodesStorage();
    const best     = selectBestStorage(allPools, type, false);
    if (!best) {
        return NextResponse.json(
            { error: `No ${type.toUpperCase()} storage pool is currently available.` },
            { status: 503 }
        );
    }
    const { node, storage: storagePool } = best;

    // ── Find next free SATA slot ───────────────────────────────────
    const diskSlot = await getNextFreeDiskSlot(node, vmId);
    if (!diskSlot) {
        return NextResponse.json(
            { error: "All extra disk slots are occupied (max 5 extra disks per VM)." },
            { status: 409 }
        );
    }

    // ── Cost + credit check ────────────────────────────────────────
    const pricePerGb = STORAGE_PRICING[type];
    const totalCost  = pricePerGb * sizeGb;

    const dbUser = await prisma.user.findUnique({
        where:  { id: userId },
        select: { credits: true, role: true },
    });
    const isAdmin = dbUser?.role === "ADMIN";

    if (!isAdmin && Number(dbUser?.credits ?? 0) < totalCost) {
        return NextResponse.json(
            {
                error: `Insufficient credits. Need ${totalCost.toLocaleString()} VND, ` +
                       `have ${Number(dbUser?.credits ?? 0).toLocaleString()} VND.`,
            },
            { status: 402 }
        );
    }

    // ── Atomic DB transaction ──────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).$transaction([
        ...(!isAdmin
            ? [
                prisma.user.update({
                    where: { id: userId },
                    data:  { credits: { decrement: totalCost } },
                }),
                prisma.creditTransaction.create({
                    data: {
                        userId,
                        type:    "VM_Deduction",
                        amount:  -totalCost,
                        details: `+${sizeGb} GB ${type.toUpperCase()} block disk · VM ${vmId} · slot ${diskSlot}`,
                    },
                }),
            ]
            : []
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).vmBlockStorageAddon.create({
            data: {
                vpsInstanceId: instance.id,
                storagePool,
                storageType:   type,
                diskSlot,
                sizeGb,
                pricePerGb,
                totalCost,
            },
        }),
    ]);

    // ── Attach disk via Proxmox API ────────────────────────────────
    // Equivalent to: qm set <vmId> --<diskSlot> <storagePool>:<sizeGb>
    let proxmoxError: string | null = null;
    try {
        await updateVMConfig(node, vmId, {
            [diskSlot]: `${storagePool}:${sizeGb},cache=writeback`,
        });
    } catch (err) {
        proxmoxError = err instanceof Error ? err.message : String(err);
        console.error(`[block-storage] Attach failed for VM ${vmId} slot ${diskSlot}:`, err);
    }

    // Audit
    void audit({
        userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action:       "STORAGE_PURCHASE" as any,
        resourceType: "VirtualMachine",
        resourceId:   vmId,
        metadata: {
            phase: "block",
            storageType: type,
            storagePool,
            diskSlot,
            sizeGb,
            totalCost,
            node,
            provisioned: !proxmoxError,
        },
        req,
    });

    return NextResponse.json({
        success:     true,
        diskSlot,
        storagePool,
        storageType: type,
        sizeGb,
        totalCost,
        node,
        ...(proxmoxError && {
            warning:       "Disk purchased but Proxmox attach failed. Contact support.",
            proxmoxError,
            // Manual fallback for the admin
            manualCommand: `qm set ${vmId} --${diskSlot} ${storagePool}:${sizeGb}`,
        }),
    });
}
