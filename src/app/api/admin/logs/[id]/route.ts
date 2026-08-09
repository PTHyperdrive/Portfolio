import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

/**
 * GET /api/admin/logs/[id]
 *
 * Returns a single AuditLog record by ID. Admin only.
 * AuditLog records are IMMUTABLE — no PATCH/PUT/DELETE operations are allowed
 * per ISO 27001 A.12.4 (tampering prevention).
 */
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { error } = await requireAdmin();
        if (error) return error;

        const { id } = await params;

        const log = await prisma.auditLog.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, email: true, name: true } },
            },
        });

        if (!log) {
            return NextResponse.json({ error: "Log not found" }, { status: 404 });
        }

        return NextResponse.json({ log });
    } catch (error) {
        console.error("Admin log detail error:", error);
        return NextResponse.json({ error: "Failed to load log" }, { status: 500 });
    }
}
