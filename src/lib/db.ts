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

    // Parse the mysql:// URL ourselves because the mariadb driver's
    // URL parser chokes on URL-encoded special characters in passwords.
    const parsed = new URL(url.replace(/^mysql:\/\//, 'mariadb://'));

    return createPool({
        host: parsed.hostname,
        port: parseInt(parsed.port || '3306', 10),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ''),
        connectionLimit: 10,
        connectTimeout: 30000,
    });
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
