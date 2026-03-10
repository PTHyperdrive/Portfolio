import { PrismaClient } from '@/generated/prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mysql from 'mysql2/promise';

const dbUrl = new URL(process.env.DATABASE_URL!);
const pool = mysql.createPool({
    host: dbUrl.hostname,
    port: Number(dbUrl.port) || 3306,
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    database: dbUrl.pathname.slice(1),
    ssl: false as any,
    connectionLimit: 10,
});
const adapter = new PrismaMariaDb(pool);

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new (PrismaClient as any)({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
