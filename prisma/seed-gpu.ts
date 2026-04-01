/**
 * GPU Node Seed Script
 *
 * Inserts the two physical TU106 GPUs into the GpuNode table.
 * Run once after `prisma db push`:
 *
 *   npx tsx prisma/seed-gpu.ts
 *
 * Allocation rules:
 *   GPU 1 — 0000:03:00.0 — 6 GB total VRAM
 *     → 4 GB usable per VM, 2 GB unusable slice
 *     → maxVms = 1
 *
 *   GPU 2 — 0000:81:00.0 — 12 GB total VRAM
 *     → 4 GB per VM × 3 VMs
 *     → maxVms = 3
 *
 * The script is idempotent — it uses upsert so re-running is safe.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
    const gpus = [
        {
            pciAddress: "0000:03:00.0",
            label:      "TU106-GPU1-6GB",
            totalVram:  4,   // allocatable VRAM (total 6GB, 2GB unusable)
            maxVms:     1,
        },
        {
            pciAddress: "0000:81:00.0",
            label:      "TU106-GPU2-12GB",
            totalVram:  12,  // allocatable VRAM (12GB, 4GB/VM × 3 VMs)
            maxVms:     3,
        },
    ];

    for (const gpu of gpus) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (prisma as any).gpuNode.upsert({
            where:  { pciAddress: gpu.pciAddress },
            update: { label: gpu.label, totalVram: gpu.totalVram, maxVms: gpu.maxVms },
            create: { ...gpu, usedVram: 0, active: true },
        });
        console.log(`✅ GPU upserted: ${result.pciAddress} (${result.label})`);
    }

    console.log("\nGPU Capacity Summary:");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = await (prisma as any).gpuNode.findMany({ orderBy: { pciAddress: "asc" } });
    for (const g of all) {
        console.log(
            `  ${g.pciAddress} | ${g.label} | ` +
            `${g.totalVram - g.usedVram}/${g.totalVram} GB free | maxVms: ${g.maxVms}`
        );
    }
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
