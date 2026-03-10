import { PrismaClient } from '@/generated/prisma';
import { PrismaMariadb } from '@prisma/adapter-mariadb';
import mariadb from 'mysql2/promise';

const pool = mariadb.createPool(process.env.DATABASE_URL!);
const adapter = new PrismaMariadb(pool);

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new (PrismaClient as any)({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
