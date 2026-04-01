/**
 * GPU Allocator — Atomic VRAM Reservation
 *
 * Manages the two TU106 GPUs available for PCIe passthrough:
 *   GPU 1 — 0000:03:00.0 — 6 GB total,  max 1 VM  (4 GB/VM, 2 GB unusable)
 *   GPU 2 — 0000:81:00.0 — 12 GB total, max 3 VMs (4 GB/VM)
 *
 * NOTE: All `gpuNode` references below produce IDE lint errors until
 * `npx prisma db push && npx prisma generate` has been run.
 * The eslint-disable comments and `as any` casts are intentional and
 * temporary — they will be removed once GpuNode exists in the generated client.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { prisma } from "@/lib/db";

/** VRAM reserved per GPU-backed VM (GB). */
export const VRAM_PER_VM = 4;

/** Sentinel error message checked by callers to trigger the upsell flow. */
export const INSUFFICIENT_GPU = "INSUFFICIENT_GPU_RESOURCES";

/**
 * Result returned from a successful GPU allocation.
 */
export interface GpuAllocation {
    gpuNodeId:  string;
    pciAddress: string;
    label:      string | null;
}

/**
 * Allocate 4 GB of VRAM from the best-available GPU.
 *
 * Must be called inside a `prisma.$transaction` interactive session so that
 * the check-then-update is atomic. Simply pass the transaction client `tx`.
 *
 * Algorithm:
 *   1. Fetch all active GPU rows inside the transaction.
 *   2. Find the first GPU where:
 *        - (totalVram − usedVram) >= VRAM_PER_VM
 *        - current VM count < maxVms         (hard capacity guard)
 *   3. Increment usedVram atomically.
 *   4. Return the allocation details (gpuNodeId + pciAddress).
 *
 * @throws Error("INSUFFICIENT_GPU_RESOURCES") when no GPU has capacity.
 */
export async function allocateGpu(tx: any): Promise<GpuAllocation> {
    // Fetch all active GPUs with their linked VM count.
    const gpus: any[] = await tx.gpuNode.findMany({
        where:   { active: true },
        include: { vms: { select: { id: true } } },
        orderBy: { usedVram: "asc" }, // prefer GPU with most free VRAM first
    });

    const candidate = gpus.find((gpu: any) => {
        const freeVram = gpu.totalVram - gpu.usedVram;
        const vmCount  = gpu.vms.length;
        return freeVram >= VRAM_PER_VM && vmCount < gpu.maxVms;
    });

    if (!candidate) {
        throw new Error(INSUFFICIENT_GPU);
    }

    // Atomically reserve VRAM
    const updated: any = await tx.gpuNode.update({
        where: { id: candidate.id },
        data:  { usedVram: { increment: VRAM_PER_VM } },
    });

    return {
        gpuNodeId:  updated.id,
        pciAddress: updated.pciAddress,
        label:      updated.label,
    };
}

/**
 * Release 4 GB of VRAM back to the pool after a GPU-backed VM is destroyed.
 *
 * Safe to call outside a transaction — uses a single atomic update.
 * Clamps usedVram at 0 to guard against double-release bugs.
 *
 * @param gpuNodeId  The GpuNode.id stored on the destroyed VpsInstance.
 */
export async function releaseGpu(gpuNodeId: string): Promise<void> {
    const gpu: any = await (prisma as any).gpuNode.findUnique({
        where:  { id: gpuNodeId },
        select: { usedVram: true },
    });

    if (!gpu) {
        console.warn(`[releaseGpu] GpuNode ${gpuNodeId} not found — skipping release.`);
        return;
    }

    const newUsed = Math.max(0, gpu.usedVram - VRAM_PER_VM);
    await (prisma as any).gpuNode.update({
        where: { id: gpuNodeId },
        data:  { usedVram: newUsed },
    });
}

/**
 * Return a snapshot of all GPU nodes with their current capacity.
 * Used by the admin dashboard / monitoring endpoints.
 */
export async function getGpuCapacityReport() {
    const gpus: any[] = await (prisma as any).gpuNode.findMany({
        include: { vms: { select: { id: true, userId: true, status: true } } },
        orderBy: { pciAddress: "asc" },
    });

    return gpus.map((gpu: any) => ({
        id:         gpu.id,
        pciAddress: gpu.pciAddress,
        label:      gpu.label,
        totalVram:  gpu.totalVram,
        usedVram:   gpu.usedVram,
        freeVram:   gpu.totalVram - gpu.usedVram,
        maxVms:     gpu.maxVms,
        currentVms: gpu.vms.length,
        active:     gpu.active,
        vms:        gpu.vms,
    }));
}
