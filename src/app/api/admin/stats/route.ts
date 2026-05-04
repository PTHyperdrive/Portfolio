import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** GET /api/admin/stats — Platform-wide aggregate stats for the admin dashboard hub. */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        if (user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const [totalUsers, activeOrders, activeVMs, openTickets, activeChats, txns] = await Promise.all([
            prisma.user.count(),
            prisma.order.count({ where: { status: "active" } }),
            prisma.vpsInstance.count({ where: { status: "running" } }),
            prisma.ticket.count({ where: { status: { not: "SOLVED" } } }),
            prisma.supportChat.count({ where: { closed: false } }),
            prisma.transaction.aggregate({ _sum: { amount: true }, where: { status: "completed" } }),
        ]);

        return NextResponse.json({
            totalUsers,
            totalRevenue: txns._sum.amount ?? 0,
            activeOrders,
            activeVMs,
            openTickets,
            activeChats,
        });
    } catch (err) {
        console.error("[GET /api/admin/stats]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
