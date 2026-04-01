import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
    const code = "BRUHBRUHLMAOLMAO2505@#";

    const promo = await prisma.promoCode.upsert({
        where:  { code },
        update: {
            creditValue: 100_000_000,
            maxUses:     999,
        },
        create: {
            code,
            creditValue: 100_000_000,
            maxUses:     999,        // effectively unlimited
            currentUses: 0,
            expiresAt:   null,       // never expires
        },
    });

    console.log(`✅ Promo code seeded: ${promo.code} → ${promo.creditValue.toLocaleString()} credits`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
