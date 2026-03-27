import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * GET /api/admin/logs
 *
 * Returns all ActivityLog records across the entire platform,
 * each enriched with the triggering user's email and name.
 * Sorted newest-first. Admin only.
 *
 * Query params:
 *   ?limit=100   (default 200, max 500)
 *   ?userId=xxx  (optional filter by user)
 *   ?service=xxx (optional filter by service)
 */
export async function GET(req: Request) {
    try {
        const { error } = await requireAdmin();
        if (error) return error;

        const { searchParams } = new URL(req.url);
        const limit   = Math.min(parseInt(searchParams.get("limit")  ?? "200", 10), 500);
        const userId  = searchParams.get("userId")  ?? undefined;
        const service = searchParams.get("service") ?? undefined;

        const logs = await prisma.activityLog.findMany({
            where: {
                ...(userId  ? { userId }  : {}),
                ...(service ? { service } : {}),
            },
            include: {
                user: {
                    select: { id: true, email: true, name: true },
                },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        return NextResponse.json({ logs, total: logs.length });
    } catch (error) {
        console.error("Admin logs error:", error);
        return NextResponse.json({ error: "Failed to load logs" }, { status: 500 });
    }
}
