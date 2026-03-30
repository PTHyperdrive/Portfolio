import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * GET /api/admin/logs
 *
 * Returns all AuditLog records across the entire platform,
 * each enriched with the triggering user's email and name.
 * Sorted newest-first. Admin only.
 *
 * Query params:
 *   ?limit=100   (default 200, max 500)
 *   ?userId=xxx  (optional filter by user)
 *   ?action=xxx  (optional filter by AuditAction)
 */
export async function GET(req: Request) {
    try {
        const { error } = await requireAdmin();
        if (error) return error;

        const { searchParams } = new URL(req.url);
        const limit  = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);
        const userId = searchParams.get("userId") ?? undefined;
        const action = searchParams.get("action") ?? undefined;

        const logs = await prisma.auditLog.findMany({
            where: {
                ...(userId ? { userId } : {}),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(action ? { action: action as any } : {}),
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
