import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Validate that a value is a non-empty string within a length limit. */
function isValidString(val: unknown, maxLen: number): val is string {
    return typeof val === "string" && val.length > 0 && val.length <= maxLen;
}

/**
 * POST /api/mmo/chat — Initialize a new encrypted chat thread.
 * Body: { pin, userPubKey, userEncPrivKey, userKeyIv }
 *
 * Input validation:
 *   - pin:           numeric digits only, 4–8 chars
 *   - userPubKey:    JSON string (JWK), max 2KB
 *   - userEncPrivKey: base64 string, max 10KB
 *   - userKeyIv:     base64 string, max 64 chars
 *
 * Returns { id, adminPubKey } so the client can derive the ECDH shared key.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id)
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });

        const body = await req.json();
        const { pin, userPubKey, userEncPrivKey, userKeyIv } = body;

        // ── Input validation ──────────────────────────────────────────
        if (!isValidString(pin, 8) || !/^\d{4,8}$/.test(pin))
            return NextResponse.json({ error: "PIN must be 4–8 numeric digits" }, { status: 400 });

        if (!isValidString(userPubKey, 2048))
            return NextResponse.json({ error: "Invalid public key" }, { status: 400 });

        if (!isValidString(userEncPrivKey, 10_000))
            return NextResponse.json({ error: "Invalid encrypted private key" }, { status: 400 });

        if (!isValidString(userKeyIv, 64))
            return NextResponse.json({ error: "Invalid key IV" }, { status: 400 });

        // Validate that userPubKey is valid JSON (JWK format)
        try { JSON.parse(userPubKey); } catch {
            return NextResponse.json({ error: "Public key must be valid JSON (JWK)" }, { status: 400 });
        }

        // Fetch admin public key — required for ECDH
        const adminPubRow = await prisma.systemConfig.findUnique({ where: { key: "admin_chat_pub_key" } });
        if (!adminPubRow)
            return NextResponse.json({ error: "Admin chat is not configured yet. Please try again later." }, { status: 503 });

        const pinHash = await bcrypt.hash(pin, 12);

        const chat = await prisma.supportChat.upsert({
            where: { userId: session.user.id },
            update: { userPubKey, userEncPrivKey, userKeyIv, pinHash, closed: false, closedAt: null },
            create: {
                userId: session.user.id,
                userPubKey,
                userEncPrivKey,
                userKeyIv,
                pinHash,
            },
        });

        return NextResponse.json({
            id: chat.id,
            adminPubKey: adminPubRow.value,
            createdAt: chat.createdAt,
        }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/mmo/chat]", err);
        return NextResponse.json({ error: "Failed to initialize chat" }, { status: 500 });
    }
}

/**
 * GET /api/mmo/chat — Get chat status + encrypted messages.
 * Returns all data needed for client-side decryption.
 * Auto-purges messages older than 30 days.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id)
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });

        const chat = await prisma.supportChat.findUnique({
            where: { userId: session.user.id },
            include: {
                messages: {
                    orderBy: { createdAt: "asc" },
                    select: {
                        id: true,
                        senderType: true,
                        ciphertext: true,
                        iv: true,
                        createdAt: true,
                    },
                },
            },
        });

        if (!chat) {
            return NextResponse.json({ exists: false });
        }

        // ── 30-day auto-purge ──
        const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
        const expiredIds = chat.messages
            .filter(m => new Date(m.createdAt) < cutoff)
            .map(m => m.id);

        if (expiredIds.length > 0) {
            await prisma.supportMessage.deleteMany({
                where: { id: { in: expiredIds } },
            });
        }

        const activeMessages = chat.messages.filter(m => new Date(m.createdAt) >= cutoff);

        // Fetch admin public key for client-side ECDH derivation
        const adminPubRow = await prisma.systemConfig.findUnique({ where: { key: "admin_chat_pub_key" } });

        return NextResponse.json({
            exists: true,
            id: chat.id,
            closed: chat.closed,
            closedAt: chat.closedAt,
            // ECDH public key — safe to expose (public by design)
            userPubKey: chat.userPubKey,
            adminPubKey: adminPubRow?.value ?? null,
            // SECURITY: pinHash, userEncPrivKey, and userKeyIv are NO LONGER
            // sent here. They are returned only via POST /api/mmo/chat/verify-pin
            // after server-side PIN verification (rate-limited, 5 attempts/min).
            // This prevents offline brute-force cracking of the PIN hash.
            // Messages (still encrypted — client decrypts after PIN unlock)
            messages: activeMessages,
        });
    } catch (err) {
        console.error("[GET /api/mmo/chat]", err);
        return NextResponse.json({ error: "Failed to fetch chat" }, { status: 500 });
    }
}
