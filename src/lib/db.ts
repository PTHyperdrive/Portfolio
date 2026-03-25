import { PrismaClient } from '@/generated/prisma';
import { PrismaMySQL2 } from '@prisma/adapter-mysql2';
import mysql from 'mysql2/promise';

// Singleton pool — reused across hot-reloads in dev
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pool: mysql.Pool | undefined;
};

function initPool(): mysql.Pool {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set in environment variables');
    return mysql.createPool(url);
}

const pool = globalForPrisma.pool ?? initPool();
const adapter = new PrismaMySQL2(pool);

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.pool = pool;
    globalForPrisma.prisma = prisma;
}

export default prisma;
