import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env

/* eslint-disable @typescript-eslint/no-explicit-any */

const GPU_INVENTORY = [
    {
        pciAddress: '0000:03:00.0',
        label:      'TU106-GPU1-6GB',
        totalVram:  4,   // allocatable (6 GB physical − 2 GB unusable)
        maxVms:     1,
    },
    {
        pciAddress: '0000:81:00.0',
        label:      'TU106-GPU2-12GB',
        totalVram:  12,  // 4 GB/VM × 3 VMs
        maxVms:     3,
    },
];

async function main() {
    const { prisma } = await import('../src/lib/db');

    try {
        console.log('🚀 Seeding GPU nodes...\n');

        for (const gpu of GPU_INVENTORY) {
            const r = await (prisma as any).gpuNode.upsert({
                where:  { pciAddress: gpu.pciAddress },
                update: { label: gpu.label, totalVram: gpu.totalVram, maxVms: gpu.maxVms, active: true },
                create: { ...gpu, usedVram: 0, active: true },
            });
            console.log(`  ✅  ${r.pciAddress}  |  ${r.label}  |  ${r.totalVram} GB allocatable  |  max ${r.maxVms} VM(s)`);
        }

        const all: any[] = await (prisma as any).gpuNode.findMany({ orderBy: { pciAddress: 'asc' } });
        console.log('\n📊  Capacity:');
        for (const g of all) {
            console.log(`  ${g.pciAddress}  |  ${g.totalVram - g.usedVram}/${g.totalVram} GB free  |  maxVms: ${g.maxVms}`);
        }

        console.log('\n✅  Done. GPU nodes ready for allocation.\n');
    } catch (error) {
        console.error('Error seeding GPU nodes:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
