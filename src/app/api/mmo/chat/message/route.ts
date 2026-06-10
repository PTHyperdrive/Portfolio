import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Validate that a string is plausible base64 and within length limits. */
function isValidBase64(str: unknown, maxLen: number): str is string {
    if (typeof str !== "string" || str.length === 0 || str.length > maxLen) return false;
    return /^[A-Za-z0-9+/=]+$/.test(str);
}

/**
 * POST /api/mmo/chat/message — Send an encrypted message
 * Body: { ciphertext: string (base64), iv: string (base64) }
 *
 * Input validation:
 *   - ciphertext: base64 string, max 100KB (generous for E2EE messages)
 *   - iv:         base64 string, max 64 chars (AES-GCM IV is 12 bytes → 16 base64 chars)
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await req.json();
        const { ciphertext, iv, chatId } = body;

        // ── Input validation ──────────────────────────────────────────
        if (!isValidBase64(ciphertext, 100_000)) {
            return NextResponse.json({ error: "Invalid ciphertext: must be base64, max 100KB" }, { status: 400 });
        }
        if (!isValidBase64(iv, 64)) {
            return NextResponse.json({ error: "Invalid IV: must be base64, max 64 chars" }, { status: 400 });
        }
        if (chatId !== undefined && (typeof chatId !== "string" || chatId.length > 100)) {
            return NextResponse.json({ error: "Invalid chatId" }, { status: 400 });
        }

        const isAdmin = (session.user as { role?: string }).role === "ADMIN";

        // Admin can specify a chatId to reply to any user's thread
        // Regular users always use their own chat
        let chat;
        if (isAdmin && chatId) {
            chat = await prisma.supportChat.findUnique({ where: { id: chatId } });
        } else {
            chat = await prisma.supportChat.findUnique({ where: { userId: session.user.id } });
        }

        if (!chat) {
            return NextResponse.json({ error: "No active chat. Initialize first." }, { status: 404 });
        }

        // Only block non-admins from sending to closed chats
        if (chat.closed && !isAdmin) {
            return NextResponse.json({ error: "Chat is closed" }, { status: 403 });
        }

        const message = await prisma.supportMessage.create({
            data: {
                chatId: chat.id,
                senderType: isAdmin ? "ADMIN" : "USER",
                ciphertext,
                iv,
            },
            select: {
                id: true,
                senderType: true,
                ciphertext: true,
                iv: true,
                createdAt: true,
            },
        });

        return NextResponse.json(message, { status: 201 });
    } catch (err: unknown) {
        console.error("[POST /api/mmo/chat/message]", err);
        return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }
}
