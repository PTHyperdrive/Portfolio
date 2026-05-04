import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Typing indicator — lightweight in-memory store.
 * Each entry auto-expires after 4 seconds.
 * Key: chatId, Value: { who: "USER"|"ADMIN", until: timestamp }
 */
const typingMap = new Map<string, { who: string; until: number }>();

/** POST /api/mmo/chat/typing — Signal typing status. */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { chatId, typing } = await req.json();
        const isAdmin = (session.user as { role?: string }).role === "ADMIN";

        // Resolve chatId
        let resolvedChatId = chatId;
        if (!isAdmin) {
            const chat = await prisma.supportChat.findUnique({ where: { userId: session.user.id }, select: { id: true } });
            resolvedChatId = chat?.id;
        }
        if (!resolvedChatId) return NextResponse.json({ ok: true });

        if (typing) {
            typingMap.set(resolvedChatId + ":" + (isAdmin ? "ADMIN" : "USER"), {
                who: isAdmin ? "ADMIN" : "USER",
                until: Date.now() + 4000,
            });
        } else {
            typingMap.delete(resolvedChatId + ":" + (isAdmin ? "ADMIN" : "USER"));
        }

        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ ok: true });
    }
}

/** GET /api/mmo/chat/typing?chatId=xxx — Check if other party is typing. */
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ typing: false });

        const isAdmin = (session.user as { role?: string }).role === "ADMIN";
        const chatId = req.nextUrl.searchParams.get("chatId");

        let resolvedChatId = chatId;
        if (!isAdmin) {
            const chat = await prisma.supportChat.findUnique({ where: { userId: session.user.id }, select: { id: true } });
            resolvedChatId = chat?.id ?? null;
        }
        if (!resolvedChatId) return NextResponse.json({ typing: false });

        // Check if the OTHER party is typing
        const otherKey = resolvedChatId + ":" + (isAdmin ? "USER" : "ADMIN");
        const entry = typingMap.get(otherKey);

        if (entry && entry.until > Date.now()) {
            return NextResponse.json({ typing: true, who: entry.who });
        }

        // Clean up expired
        if (entry) typingMap.delete(otherKey);
        return NextResponse.json({ typing: false });
    } catch {
        return NextResponse.json({ typing: false });
    }
}
