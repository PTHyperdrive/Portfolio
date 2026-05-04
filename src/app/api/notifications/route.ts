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

        const [unread, notifications] = await Promise.all([
            prisma.ticketNotification.count({
                where: { userId: session.user.id, read: false },
            }),
            prisma.ticketNotification.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: "desc" },
                take: 20,
                include: {
                    ticket: { select: { id: true, title: true, status: true } },
                },
            }),
        ]);

        return NextResponse.json({ unread, notifications });
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

        if (body.all) {
            await prisma.ticketNotification.updateMany({
                where: { userId: session.user.id, read: false },
                data: { read: true },
            });
        } else if (Array.isArray(body.ids)) {
            await prisma.ticketNotification.updateMany({
                where: {
                    id: { in: body.ids },
                    userId: session.user.id,
                },
                data: { read: true },
            });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[PATCH /api/notifications]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
