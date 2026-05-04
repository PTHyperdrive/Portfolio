import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/chats — List all support chat threads (admin only).
 * Returns threads with user info and message count.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        if (user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const chats = await prisma.supportChat.findMany({
            orderBy: { updatedAt: "desc" },
            include: {
                user: { select: { id: true, name: true, email: true, image: true } },
                messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, senderType: true } },
                _count: { select: { messages: true } },
            },
        });

        return NextResponse.json(chats.map(c => ({
            id: c.id, userId: c.userId, closed: c.closed, createdAt: c.createdAt,
            user: c.user, messageCount: c._count.messages,
            lastMessageAt: c.messages[0]?.createdAt ?? c.createdAt,
            lastSenderType: c.messages[0]?.senderType ?? null,
        })));
    } catch (err) {
        console.error("[GET /api/admin/chats]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
