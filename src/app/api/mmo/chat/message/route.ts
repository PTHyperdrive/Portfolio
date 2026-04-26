import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/mmo/chat/message — Send an encrypted message
 * Body: { ciphertext: string (base64), iv: string (base64) }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const { ciphertext, iv } = await req.json();
        if (!ciphertext || !iv) {
            return NextResponse.json({ error: "Encrypted message payload required" }, { status: 400 });
        }

        // Find user's chat
        const chat = await prisma.supportChat.findUnique({
            where: { userId: session.user.id },
        });

        if (!chat) {
            return NextResponse.json({ error: "No active chat. Initialize first." }, { status: 404 });
        }

        if (chat.closed) {
            return NextResponse.json({ error: "Chat is closed" }, { status: 403 });
        }

        const isAdmin = (session.user as { role?: string }).role === "ADMIN";

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
