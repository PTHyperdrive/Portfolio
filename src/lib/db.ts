import { PrismaClient } from '@/generated/prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { createPool, type Pool } from 'mariadb';

// ── Singleton pool + client, survives HMR in dev ────────────────
const globalForPrisma = globalThis as unknown as {
    __prisma: PrismaClient | undefined;
    __pool: Pool | undefined;
};

function initPool(): Pool {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');

    // The `mariadb` npm driver requires mariadb:// scheme but works
    // fine with MySQL servers — just swap the protocol prefix.
    const connStr = url.replace(/^mysql:\/\//, 'mariadb://');

    return createPool(connStr);
}

const pool = globalForPrisma.__pool ?? initPool();
const adapter = new PrismaMariaDb(pool);

export const prisma =
    globalForPrisma.__prisma ??
    new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.__pool = pool;
    globalForPrisma.__prisma = prisma;
}

export default prisma;
