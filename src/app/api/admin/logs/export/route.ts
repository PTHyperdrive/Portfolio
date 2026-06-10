import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * GET /api/admin/logs/export
 *
 * Exports VM lifecycle events (start/stop/reboot/create/destroy) as JSONL
 * for offline analysis / local ML training on customer usage patterns.
 *
 * Privacy: user IDs are pseudonymized by default (salted SHA-256, 16 hex
 * chars) so behaviour stays linkable per-user without exposing identity.
 * Pass ?pseudo=0 to export raw IDs (audited either way). IP/User-Agent are
 * never included in this export.
 *
 * Query params:
 *   from / to  — ISO dates (default: last 90 days)
 *   pseudo     — "0" disables pseudonymization (default on)
 *   limit      — max rows (default 50000, cap 200000)
 */

const VM_ACTIONS = ["VM_START", "VM_STOP", "VM_REBOOT", "VM_CREATE", "VM_DESTROY"] as const;

export async function GET(req: NextRequest) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    try {
        const url = new URL(req.url);
        const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date();
        const from = url.searchParams.get("from")
            ? new Date(url.searchParams.get("from")!)
            : new Date(to.getTime() - 90 * 24 * 3_600_000);
        const pseudo = url.searchParams.get("pseudo") !== "0";
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50000", 10) || 50000, 200000);

        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 });
        }

        // Salt comes from the auth secret so pseudonyms are stable across
        // exports (linkable longitudinally) but not reversible without it.
        const salt = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "export-salt";
        const anon = (id: string) =>
            createHash("sha256").update(salt + id).digest("hex").slice(0, 16);

        const rows = await prisma.auditLog.findMany({
            where: {
                action: { in: [...VM_ACTIONS] },
                createdAt: { gte: from, lte: to },
            },
            orderBy: { createdAt: "asc" },
            take: limit,
            select: {
                userId: true,
                action: true,
                resourceId: true,
                outcome: true,
                createdAt: true,
            },
        });

        const jsonl = rows
            .map((r) => JSON.stringify({
                user: pseudo ? anon(r.userId) : r.userId,
                action: r.action,
                vmId: r.resourceId,
                outcome: r.outcome,
                ts: r.createdAt.toISOString(),
                hour: r.createdAt.getUTCHours(),
                dow: r.createdAt.getUTCDay(),
            }))
            .join("\n");

        void audit({
            userId,
            action: "DATA_EXPORT",
            resourceType: "AuditLog",
            metadata: { kind: "vm_lifecycle_jsonl", rows: rows.length, pseudo, from, to },
            req,
        });

        return new Response(jsonl, {
            headers: {
                "Content-Type": "application/x-ndjson",
                "Content-Disposition": `attachment; filename="vm-lifecycle-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.jsonl"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        console.error("[GET /api/admin/logs/export]", err);
        return NextResponse.json({ error: "Export failed" }, { status: 500 });
    }
}
