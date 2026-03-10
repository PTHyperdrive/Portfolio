import { PrismaClient } from '@/generated/prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// PrismaMariaDb expects a mariadb:// connection string, so convert the protocol
const connectionString = process.env.DATABASE_URL!.replace(/^mysql:\/\//, 'mariadb://');
const adapter = new PrismaMariaDb(connectionString);

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new (PrismaClient as any)({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
