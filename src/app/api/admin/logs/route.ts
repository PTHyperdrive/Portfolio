import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { Prisma, AuditAction } from "@/generated/prisma";

/**
 * GET /api/admin/logs
 *
 * Returns paginated AuditLog records across the entire platform,
 * each enriched with the triggering user's email and name.
 * Supports server-side search, action filtering, sorting, and pagination.
 * Admin only.
 *
 * Query params:
 *   ?page=1          (1-indexed, default 1)
 *   ?limit=25        (default 25, max 100)
 *   ?search=xxx      (searches action, resourceType, outcome, user email/name)
 *   ?action=xxx      (filter by exact AuditAction enum value)
 *   ?outcome=xxx     (filter by outcome: SUCCESS, DENIED, FAILED)
 *   ?sort=asc|desc   (sort by createdAt, default desc)
 */
export async function GET(req: Request) {
    try {
        const { error } = await requireAdmin();
        if (error) return error;

        const { searchParams } = new URL(req.url);
        const page    = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
        const limit   = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)), 100);
        const search  = searchParams.get("search")?.trim() ?? "";
        const action  = searchParams.get("action") ?? undefined;
        const outcome = searchParams.get("outcome") ?? undefined;
        const sort    = (searchParams.get("sort") ?? "desc") === "asc" ? "asc" as const : "desc" as const;

        // Build the where clause
        const where: Prisma.AuditLogWhereInput = {};

        // Exact action filter
        if (action) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            where.action = action as any;
        }

        // Outcome filter
        if (outcome) {
            where.outcome = outcome;
        }

        // Free-text search — uses OR across multiple fields. `action` is an enum
        // column (no substring match in Prisma), so we resolve the search term to
        // matching enum values and filter with `in`; use the exact ?action= param
        // for a precise single-action filter.
        if (search) {
            const term = search.toLowerCase();
            const matchingActions = (Object.values(AuditAction) as string[])
                .filter((a) => a.toLowerCase().includes(term)) as AuditAction[];

            // MySQL `contains` is already case-insensitive via the column
            // collation — `mode: "insensitive"` is Postgres/Mongo-only and not
            // part of the MySQL StringFilter type.
            where.OR = [
                ...(matchingActions.length ? [{ action: { in: matchingActions } }] : []),
                { resourceType: { contains: search } },
                { outcome:      { contains: search } },
                { ipAddress:    { contains: search } },
                { user:         { email: { contains: search } } },
                { user:         { name:  { contains: search } } },
            ];
        }

        // Run count + paginated query in parallel for efficiency
        const [total, logs] = await Promise.all([
            prisma.auditLog.count({ where }),
            prisma.auditLog.findMany({
                where,
                include: {
                    user: {
                        select: { id: true, email: true, name: true },
                    },
                },
                orderBy: { createdAt: sort },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        return NextResponse.json({
            logs,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error("Admin logs error:", error);
        return NextResponse.json({ error: "Failed to load logs" }, { status: 500 });
    }
}
