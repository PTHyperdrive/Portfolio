/**
 * Create or reset an ADMIN account.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts
 *
 * Environment: reads DATABASE_URL from .env via dotenv.
 */

import bcrypt from "bcryptjs";

// Inline Prisma client — avoids import path issues with generated client
import { PrismaClient } from "../src/generated/prisma";
const prisma = new PrismaClient();

const ADMIN_EMAIL    = "admin@notrespond.com";
const ADMIN_PASSWORD = "NRSP3dhouse@#$";
const ADMIN_NAME     = "Administrator";
const SALT_ROUNDS    = 12;

async function main() {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

    const user = await prisma.user.upsert({
        where:  { email: ADMIN_EMAIL },
        update: {
            passwordHash,
            role: "ADMIN",
            name: ADMIN_NAME,
        },
        create: {
            email:        ADMIN_EMAIL,
            passwordHash,
            role:         "ADMIN",
            name:         ADMIN_NAME,
            credits:      0,
        },
    });

    console.log(`Admin account ready:`);
    console.log(`  ID:    ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Role:  ${user.role}`);
    console.log(`  Pass:  ${ADMIN_PASSWORD}`);
}

main()
    .catch(e => { console.error("Failed:", e); process.exit(1); })
    .finally(() => prisma.$disconnect());
