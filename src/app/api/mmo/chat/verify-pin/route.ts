import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { checkRateLimit } from "@/lib/security";

/**
 * POST /api/mmo/chat/verify-pin
 *
 * Server-side PIN verification for the E2EE support chat.
 *
 * Previously, the pinHash was sent to the client for client-side bcrypt.compare().
 * This leaked the hash, allowing offline PIN cracking (trivial for 4–6 digit PINs).
 *
 * Now:
 *   1. Client sends { pin } to this endpoint
 *   2. Server does bcrypt.compare(pin, storedHash)
 *   3. On success: returns the encrypted private key material
 *   4. Rate-limited: 5 attempts per minute per user
 *
 * The client uses the PIN locally to derive the AES wrapping key
 * (via pinToWrappingKey) and decrypt the ECDH private key — the
 * cryptographic binding remains intact, but the hash is never exposed.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const userId = session.user.id;

        // Rate limit: 5 attempts per 60 seconds per user
        const rl = checkRateLimit(`chat-pin:${userId}`, 5, 60_000);
        if (!rl.allowed) {
            return NextResponse.json(
                {
                    error: "Too many PIN attempts. Please try again later.",
                    retryAfterMs: rl.resetIn,
                },
                { status: 429 }
            );
        }

        const { pin } = (await req.json()) as { pin?: string };
        if (!pin) {
            return NextResponse.json({ error: "PIN is required" }, { status: 400 });
        }

        // Fetch the chat record (server-side only — never send pinHash to client)
        const chat = await prisma.supportChat.findUnique({
            where: { userId },
            select: {
                id: true,
                pinHash: true,
                userEncPrivKey: true,
                userKeyIv: true,
                userPubKey: true,
            },
        });

        if (!chat) {
            return NextResponse.json({ error: "No chat found" }, { status: 404 });
        }

        // Server-side PIN verification
        const isValid = await bcrypt.compare(pin, chat.pinHash);
        if (!isValid) {
            return NextResponse.json(
                {
                    error: "Incorrect PIN",
                    remaining: rl.remaining,
                },
                { status: 403 }
            );
        }

        // PIN is correct — return the encrypted key material
        // The client still needs the correct PIN to derive the AES wrapping
        // key and actually decrypt the ECDH private key
        return NextResponse.json({
            verified: true,
            userEncPrivKey: chat.userEncPrivKey,
            userKeyIv: chat.userKeyIv,
            userPubKey: chat.userPubKey,
        });
    } catch (err) {
        console.error("[POST /api/mmo/chat/verify-pin]", err);
        return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }
}
