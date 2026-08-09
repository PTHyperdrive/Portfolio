import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

/**
 * GET /api/admin/users
 *
 * Paginated + searchable list of all users with VM counts.
 * Admin only.
 *
 * Query params:
 *   ?page=1      (1-indexed, default 1)
 *   ?limit=10    (rows per page, max 100)
 *   ?search=foo  (filters email OR name, case-insensitive via LIKE)
 */
export async function GET(req: Request) {
    try {
        const { error } = await requireAdmin();
        if (error) return error;

        const { searchParams } = new URL(req.url);
        const page   = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10));
        const limit  = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10)), 100);
        const search = searchParams.get("search")?.trim() ?? "";
        const skip   = (page - 1) * limit;

        // MySQL uses default (LIKE-based) mode — 'insensitive' is Postgres-only
        const where = search
            ? {
                OR: [
                    { email: { contains: search } },
                    { name:  { contains: search } },
                ],
            }
            : {};

        const [users, total] = await prisma.$transaction([
            prisma.user.findMany({
                where,
                select: {
                    id:           true,
                    name:         true,
                    email:        true,
                    role:         true,
                    credits:      true,
                    hasUsedTrial: true,
                    createdAt:    true,
                    _count: {
                        select: { orders: true, vpsInstances: true },
                    },
                    vpsInstances: {
                        select: {
                            id:     true,
                            vmId:   true,
                            node:   true,
                            name:   true,
                            os:     true,
                            status: true,
                            specs:  true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: limit,
                skip,
            }),
            prisma.user.count({ where }),
        ]);

        return NextResponse.json({
            data: users,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Admin users list error:", error);
        return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
    }
}
