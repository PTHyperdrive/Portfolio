import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET  /api/admin/chats/[chatId] — Read all messages in a chat thread (admin only).
 * PATCH /api/admin/chats/[chatId] — Toggle closed status.
 */
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        if (user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { chatId } = await params;
        const chat = await prisma.supportChat.findUnique({
            where: { id: chatId },
            include: {
                user: { select: { id: true, name: true, email: true } },
                messages: { orderBy: { createdAt: "asc" } },
            },
        });

        if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

        return NextResponse.json({
            ...chat,
            secretChatEligible: (Date.now() - new Date(chat.createdAt).getTime()) > 30 * 24 * 60 * 60 * 1000,
        });
    } catch (err) {
        console.error("[GET /api/admin/chats/[chatId]]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        if (user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { chatId } = await params;
        const body = await req.json();

        const updated = await prisma.supportChat.update({
            where: { id: chatId },
            data: { closed: body.closed ?? false },
        });

        return NextResponse.json(updated);
    } catch (err) {
        console.error("[PATCH /api/admin/chats/[chatId]]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
