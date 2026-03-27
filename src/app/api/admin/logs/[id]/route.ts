import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * PATCH /api/admin/logs/[id]
 *
 * Update a specific ActivityLog record.
 * Useful for redacting sensitive data, correcting labels, or changing status.
 * Admin only.
 *
 * Body (all fields optional):
 *   { action?: string, status?: string, details?: any }
 */
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error } = await requireAdmin();
        if (error) return error;

        const { id } = await params;
        if (!id) {
            return NextResponse.json({ error: "Log ID is required" }, { status: 400 });
        }

        let body: Record<string, unknown> = {};
        try { body = await req.json(); } catch { /* empty body ok */ }

        const { action, status, details } = body as {
            action?: string;
            status?: string;
            details?: unknown;
        };

        // Ensure at least one field is being updated
        if (action === undefined && status === undefined && details === undefined) {
            return NextResponse.json(
                { error: "Provide at least one of: action, status, details" },
                { status: 400 }
            );
        }

        // Verify the log exists
        const existing = await prisma.activityLog.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "Log not found" }, { status: 404 });
        }

        const updated = await prisma.activityLog.update({
            where: { id },
            data: {
                ...(action  !== undefined ? { action }  : {}),
                ...(status  !== undefined ? { status }  : {}),
                // Prisma requires Prisma.DbNull / Prisma.JsonNull for nullable JSON fields
                ...(details !== undefined
                    ? { details: details === null ? Prisma.DbNull : details }
                    : {}),
            },
            include: {
                user: { select: { id: true, email: true, name: true } },
            },
        });

        return NextResponse.json({ log: updated });
    } catch (error) {
        console.error("Admin log update error:", error);
        return NextResponse.json({ error: "Failed to update log" }, { status: 500 });
    }
}
