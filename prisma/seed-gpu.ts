import { PrismaClient } from "../src/generated/prisma";

/* eslint-disable @typescript-eslint/no-explicit-any */
const prisma = new PrismaClient() as any;

const GPU_INVENTORY = [
    {
        pciAddress: "0000:03:00.0",
        label:      "TU106-GPU1-6GB",
        totalVram:  4,   // allocatable (6GB physical − 2GB unusable)
        maxVms:     1,
    },
    {
        pciAddress: "0000:81:00.0",
        label:      "TU106-GPU2-12GB",
        totalVram:  12,  // 4GB/VM × 3 VMs
        maxVms:     3,
    },
];

async function main() {
    console.log("🚀 Seeding GPU nodes...\n");
    for (const gpu of GPU_INVENTORY) {
        const r = await prisma.gpuNode.upsert({
            where:  { pciAddress: gpu.pciAddress },
            update: { label: gpu.label, totalVram: gpu.totalVram, maxVms: gpu.maxVms, active: true },
            create: { ...gpu, usedVram: 0, active: true },
        });
        console.log(`  ✅  ${r.pciAddress}  |  ${r.label}  |  ${r.totalVram} GB allocatable  |  max ${r.maxVms} VM(s)`);
    }

    const all = await prisma.gpuNode.findMany({ orderBy: { pciAddress: "asc" } });
    console.log("\n📊  Capacity:");
    for (const g of all) {
        console.log(`  ${g.pciAddress}  |  ${g.totalVram - g.usedVram}/${g.totalVram} GB free  |  maxVms: ${g.maxVms}`);
    }
}

main()
    .catch((e: unknown) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
