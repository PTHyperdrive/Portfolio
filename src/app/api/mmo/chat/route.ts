import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * POST /api/mmo/chat — Initialize a new encrypted chat thread.
 * Body: { pin, userPubKey, userEncPrivKey, userKeyIv }
 *
 * Returns { id, adminPubKey } so the client can derive the ECDH shared key.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id)
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });

        const { pin, userPubKey, userEncPrivKey, userKeyIv } = await req.json();
        if (!pin || pin.length < 4 || !userPubKey || !userEncPrivKey || !userKeyIv)
            return NextResponse.json({ error: "PIN (4+ digits), public key, and encrypted private key required" }, { status: 400 });

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
            // ECDH key material — client needs these to derive shared key
            userPubKey: chat.userPubKey,
            userEncPrivKey: chat.userEncPrivKey,
            userKeyIv: chat.userKeyIv,
            adminPubKey: adminPubRow?.value ?? null,
            // PIN verification
            pinHash: chat.pinHash,
            // Messages (still encrypted — client decrypts)
            messages: activeMessages,
        });
    } catch (err) {
        console.error("[GET /api/mmo/chat]", err);
        return NextResponse.json({ error: "Failed to fetch chat" }, { status: 500 });
    }
}
