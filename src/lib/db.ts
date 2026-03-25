import { PrismaClient } from '@/generated/prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { createPool, Pool } from 'mariadb';

// Singleton pool — reused across hot-reloads in dev
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pool: Pool | undefined;
};

function initPool(): Pool {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set in environment variables');
    return createPool(url);
}

const pool = globalForPrisma.pool ?? initPool();
const adapter = new PrismaMariaDb(pool);

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.pool = pool;
    globalForPrisma.prisma = prisma;
}

export default prisma;
