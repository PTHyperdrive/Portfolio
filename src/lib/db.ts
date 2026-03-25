import { PrismaClient } from '@/generated/prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';

// Singleton pool — reused across hot-reloads in dev
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pool: mariadb.Pool | undefined;
};

function createPool(): mariadb.Pool {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set in environment variables');
    return mariadb.createPool(url);
}

const pool = globalForPrisma.pool ?? createPool();
const adapter = new PrismaMariaDb(pool);

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.pool = pool;
    globalForPrisma.prisma = prisma;
}

export default prisma;
