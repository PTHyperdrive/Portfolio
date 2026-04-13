import { PrismaClient } from '@/generated/prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as {
    __prisma: PrismaClient | undefined;
};

function createAdapter(): PrismaMariaDb {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');

    const parsed = new URL(url.replace(/^mysql:\/\//, 'mariadb://'));
    const host     = parsed.hostname;
    const port     = parseInt(parsed.port || '3306', 10);
    const user     = decodeURIComponent(parsed.username);
    const database = parsed.pathname.replace(/^\//, '');

    // Read RSA / TLS flags from the connection string query params.
    // The mariadb driver does NOT inherit these from the URL automatically
    // when options are passed as a plain object — they must be forwarded explicitly.
    const params                = parsed.searchParams;
    const allowPublicKeyRetrieval =
        params.get('allowPublicKeyRetrieval')?.toLowerCase() === 'true';
    const cachingRsaPublicKey   = params.get('cachingRsaPublicKey') ?? undefined;

    return new PrismaMariaDb({
        host,
        port,
        user,
        password: decodeURIComponent(parsed.password),
        database,
        connectionLimit: 10,
        connectTimeout:  30000,
        // ── RSA public-key options ──────────────────────────────────
        // Required when the server uses caching_sha2_password auth plugin and
        // the client does not already have the server's RSA public key cached.
        // Set allowPublicKeyRetrieval=true in DATABASE_URL to enable,
        // or point cachingRsaPublicKey to a local copy of the server's key.
        ...(allowPublicKeyRetrieval && { allowPublicKeyRetrieval: true }),
        ...(cachingRsaPublicKey    && { cachingRsaPublicKey }),
    });
}

export const prisma =
    globalForPrisma.__prisma ??
    new PrismaClient({ adapter: createAdapter() });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.__prisma = prisma;
}

export default prisma;
