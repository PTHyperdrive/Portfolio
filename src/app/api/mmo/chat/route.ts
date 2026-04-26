import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * POST /api/mmo/chat — Initialize chat (create keypair + set PIN)
 * Body: { publicKey: string (JWK), pin: string }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const { publicKey, pin } = await req.json();
        if (!publicKey || !pin || pin.length < 4) {
            return NextResponse.json({ error: "Public key and 4+ digit PIN required" }, { status: 400 });
        }

        // Hash the PIN server-side
        const pinHash = await bcrypt.hash(pin, 12);

        const chat = await prisma.supportChat.upsert({
            where: { userId: session.user.id },
            update: { publicKey, pinHash, closed: false },
            create: {
                userId: session.user.id,
                publicKey,
                pinHash,
            },
        });

        return NextResponse.json({ id: chat.id, createdAt: chat.createdAt }, { status: 201 });
    } catch (err: unknown) {
        console.error("[POST /api/mmo/chat]", err);
        return NextResponse.json({ error: "Failed to initialize chat" }, { status: 500 });
    }
}

/**
 * GET /api/mmo/chat — Get chat status + messages (PIN verified client-side)
 * Returns the chat ID + all encrypted messages, user decrypts on client.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

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

        return NextResponse.json({
            exists: true,
            id: chat.id,
            publicKey: chat.publicKey,
            pinHash: chat.pinHash,
            closed: chat.closed,
            messages: chat.messages,
        });
    } catch (err: unknown) {
        console.error("[GET /api/mmo/chat]", err);
        return NextResponse.json({ error: "Failed to fetch chat" }, { status: 500 });
    }
}
