import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * GET  /api/admin/chats/[chatId] — Read chat detail + all messages (admin only).
 *      Auto-purges messages older than 30 days.
 *      Returns userPubKey so admin can derive ECDH shared key.
 *
 * PATCH /api/admin/chats/[chatId] — Permanently close a chat.
 *       Closing deletes ALL messages and sets closedAt. Cannot be reopened.
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

        // ── 30-day auto-purge ──
        const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
        const expiredIds = chat.messages
            .filter(m => new Date(m.createdAt) < cutoff)
            .map(m => m.id);

        if (expiredIds.length > 0) {
            await prisma.supportMessage.deleteMany({ where: { id: { in: expiredIds } } });
        }

        const activeMessages = chat.messages.filter(m => new Date(m.createdAt) >= cutoff);

        return NextResponse.json({
            id: chat.id,
            userId: chat.userId,
            closed: chat.closed,
            closedAt: chat.closedAt,
            createdAt: chat.createdAt,
            userPubKey: chat.userPubKey,
            user: chat.user,
            messages: activeMessages,
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

        if (body.closed === true) {
            // ── Permanent close: delete ALL messages + mark closed ──
            await prisma.supportMessage.deleteMany({ where: { chatId } });

            const updated = await prisma.supportChat.update({
                where: { id: chatId },
                data: { closed: true, closedAt: new Date() },
            });

            // Audit the permanent closure
            await prisma.auditLog.create({
                data: {
                    userId: session.user.id,
                    action: "ADMIN_CHAT_CLOSED",
                    resourceType: "SupportChat",
                    outcome: "SUCCESS",
                },
            }).catch(() => {});

            return NextResponse.json(updated);
        }

        return NextResponse.json({ error: "Invalid action. Closed chats cannot be reopened." }, { status: 400 });
    } catch (err) {
        console.error("[PATCH /api/admin/chats/[chatId]]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
