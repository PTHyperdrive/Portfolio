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

    const host = parsed.hostname;
    const port = parseInt(parsed.port || '3306', 10);
    const user = decodeURIComponent(parsed.username);
    const database = parsed.pathname.replace(/^\//, '');

    // ── DEBUG: log what we're connecting to ──
    console.log('[db.ts] DATABASE_URL env:', url.substring(0, 30) + '...');
    console.log('[db.ts] Connecting to:', { host, port, user, database });

    return createPool({
        host,
        port,
        user,
        password: decodeURIComponent(parsed.password),
        database,
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
