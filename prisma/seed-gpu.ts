/**
 * GPU Node Seed Script
 *
 * Run in this exact order:
 *   1. npx prisma db push
 *   2. npx prisma generate
 *   3. npx tsx prisma/seed-gpu.ts
 */

// Resolve generated client relative to project root, not prisma/ dir
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const clientPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src/generated/prisma");

// eslint-disable-next-line @typescript-eslint/no-require-imports
let PrismaClient: new () => Record<string, unknown>;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    PrismaClient = require(clientPath).PrismaClient;
} catch {
    console.error(
        "\n❌  Cannot find the generated Prisma client.\n" +
        "    Run these commands first, then re-run the seed:\n\n" +
        "      npx prisma db push\n" +
        "      npx prisma generate\n"
    );
    process.exit(1);
}

const prisma = new PrismaClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * GPU hardware inventory.
 *
 * GPU 1 — 0000:03:00.0 — 6 GB total, 4 GB allocatable (2 GB unusable), max 1 VM
 * GPU 2 — 0000:81:00.0 — 12 GB total, 12 GB allocatable (4 GB/VM × 3 VMs), max 3 VMs
 */
const GPU_INVENTORY = [
    {
        pciAddress: "0000:03:00.0",
        label:      "TU106-GPU1-6GB",
        totalVram:  4,   // allocatable VRAM only (6GB physical − 2GB unusable)
        maxVms:     1,
    },
    {
        pciAddress: "0000:81:00.0",
        label:      "TU106-GPU2-12GB",
        totalVram:  12,  // full 12GB allocatable at 4GB/VM
        maxVms:     3,
    },
];

async function main() {
    console.log("🚀 Seeding GPU nodes...\n");

    for (const gpu of GPU_INVENTORY) {
        const result = await prisma.gpuNode.upsert({
            where:  { pciAddress: gpu.pciAddress },
            update: { label: gpu.label, totalVram: gpu.totalVram, maxVms: gpu.maxVms, active: true },
            create: { ...gpu, usedVram: 0, active: true },
        });
        console.log(`  ✅  ${result.pciAddress}  |  ${result.label}  |  ${result.totalVram} GB allocatable  |  max ${result.maxVms} VM(s)`);
    }

    console.log("\n📊  Live capacity after seed:");
    const all = await prisma.gpuNode.findMany({ orderBy: { pciAddress: "asc" } });
    for (const g of all) {
        const free = g.totalVram - g.usedVram;
        console.log(`  ${g.pciAddress}  |  ${free}/${g.totalVram} GB free  |  active: ${g.active}`);
    }

    console.log("\n✅  Done. GPU nodes are ready for allocation.\n");
}

main()
    .catch((e: unknown) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
