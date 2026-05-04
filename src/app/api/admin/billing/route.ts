import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/billing — All transactions across all users (admin only).
 * Query params: page, limit, search, status
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        if (user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const page   = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
        const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "25"));
        const search = searchParams.get("search") ?? "";
        const status = searchParams.get("status") ?? "";

        const where = {
            ...(status ? { status } : {}),
            ...(search ? {
                OR: [
                    { user: { OR: [{ email: { contains: search } }, { name: { contains: search } }] } },
                    { plan: { contains: search } },
                    { method: { contains: search } },
                ],
            } : {}),
        };

        const [transactions, total, aggregate] = await Promise.all([
            prisma.transaction.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    user: { select: { id: true, name: true, email: true } },
                },
            }),
            prisma.transaction.count({ where }),
            prisma.transaction.aggregate({
                _sum: { amount: true },
                _count: { _all: true },
                where: { status: "completed" },
            }),
        ]);

        return NextResponse.json({
            transactions,
            summary: {
                totalRevenue: aggregate._sum.amount ?? 0,
                completedCount: aggregate._count._all,
            },
            meta: {
                page, limit, total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPrevPage: page > 1,
            },
        });
    } catch (err) {
        console.error("[GET /api/admin/billing]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
