import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET  /api/notifications — Get unread count + recent notifications for current user.
 * PATCH /api/notifications — Mark notifications as read.
 *   Body: { ids: string[] } or { all: true }
 */

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const [ticketUnread, sysUnread, tickets, sys] = await Promise.all([
            prisma.ticketNotification.count({ where: { userId, read: false } }),
            prisma.notification.count({ where: { userId, read: false } }),
            prisma.ticketNotification.findMany({
                where: { userId },
                orderBy: { createdAt: "desc" },
                take: 20,
                include: { ticket: { select: { id: true, title: true, status: true } } },
            }),
            prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 }),
        ]);

        // Merge ticket + system notifications into one normalized, sorted feed.
        const notifications = [
            ...tickets.map(n => ({ id: n.id, source: "ticket" as const, title: `Ticket: ${n.ticket?.title ?? "update"}`, body: n.message, read: n.read, createdAt: n.createdAt, link: "/dashboard/tickets" })),
            ...sys.map(n => ({ id: n.id, source: "system" as const, title: n.title, body: n.body, read: n.read, createdAt: n.createdAt, link: n.link })),
        ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 20);

        return NextResponse.json({ unread: ticketUnread + sysUnread, notifications });
    } catch (err) {
        console.error("[GET /api/notifications]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();

        const userId = session.user.id;
        if (body.all) {
            await Promise.all([
                prisma.ticketNotification.updateMany({ where: { userId, read: false }, data: { read: true } }),
                prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } }),
            ]);
        } else if (Array.isArray(body.ids)) {
            // IDs are cuids, unique across both tables — marking in both is safe.
            await Promise.all([
                prisma.ticketNotification.updateMany({ where: { id: { in: body.ids }, userId }, data: { read: true } }),
                prisma.notification.updateMany({ where: { id: { in: body.ids }, userId }, data: { read: true } }),
            ]);
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[PATCH /api/notifications]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
