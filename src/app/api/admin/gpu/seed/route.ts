import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */
const GPU_INVENTORY = [
    {
        pciAddress: "0000:03:00.0",
        label:      "TU106-GPU1-6GB",
        totalVram:  4,   // allocatable (6 GB physical − 2 GB unusable slice)
        maxVms:     1,
    },
    {
        pciAddress: "0000:81:00.0",
        label:      "TU106-GPU2-12GB",
        totalVram:  12,  // 4 GB/VM × 3 VMs
        maxVms:     3,
    },
];

/**
 * POST /api/admin/gpu/seed
 *
 * One-time idempotent seed that inserts the two TU106 GPU nodes.
 * Admin-only. Safe to call multiple times (upsert).
 */
export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((session.user as { role?: string }).role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Import prisma lazily to avoid top-level resolution issues
    const { prisma } = await import("@/lib/db");
    const db = prisma as any;

    const results = [];
    for (const gpu of GPU_INVENTORY) {
        const row = await db.gpuNode.upsert({
            where:  { pciAddress: gpu.pciAddress },
            update: { label: gpu.label, totalVram: gpu.totalVram, maxVms: gpu.maxVms, active: true },
            create: { ...gpu, usedVram: 0, active: true },
        });
        results.push({
            pciAddress: row.pciAddress,
            label:      row.label,
            totalVram:  row.totalVram,
            maxVms:     row.maxVms,
            freeVram:   row.totalVram - row.usedVram,
        });
    }

    return NextResponse.json({ seeded: results });
}
