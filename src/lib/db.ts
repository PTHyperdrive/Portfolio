import { PrismaClient } from '@/generated/prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as {
    __prisma: PrismaClient | undefined;
};

function createAdapter(): PrismaMariaDb {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');

    const parsed = new URL(url.replace(/^mysql:\/\//, 'mariadb://'));
    const host = parsed.hostname;
    const port = parseInt(parsed.port || '3306', 10);
    const user = decodeURIComponent(parsed.username);
    const database = parsed.pathname.replace(/^\//, '');

    return new PrismaMariaDb({
        host,
        port,
        user,
        password: decodeURIComponent(parsed.password),
        database,
        connectionLimit: 10,
        connectTimeout: 30000,
    });
}

export const prisma =
    globalForPrisma.__prisma ??
    new PrismaClient({ adapter: createAdapter() });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.__prisma = prisma;
}

export default prisma;
