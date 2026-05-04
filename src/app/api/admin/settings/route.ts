import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET  /api/admin/settings — Retrieve global platform configuration.
 * PATCH /api/admin/settings — Update one or more settings by key.
 *
 * Uses the existing SystemConfig model (key/value pairs).
 * Expected keys:
 *   proxmox_node_ip        — Primary Proxmox node endpoint
 *   truenas_endpoint       — TrueNAS API endpoint
 *   credit_vnd_rate        — VND per 1 credit (e.g. "1000")
 *   credit_min_topup       — Minimum credit top-up amount
 *   trial_duration_days    — Free trial VM lifetime in days
 *   maintenance_mode       — "true" | "false"
 *   registration_enabled   — "true" | "false"
 */

async function requireAdmin() {
    const session = await auth();
    if (!session?.user?.id) return null;
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    return user?.role === "ADMIN" ? session : null;
}

export async function GET() {
    try {
        const session = await requireAdmin();
        if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const configs = await prisma.systemConfig.findMany({ orderBy: { key: "asc" } });
        const settings: Record<string, string> = {};
        configs.forEach(c => { settings[c.key] = c.value; });

        return NextResponse.json({ settings });
    } catch (err) {
        console.error("[GET /api/admin/settings]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await requireAdmin();
        if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const body = await req.json();
        const updates: Record<string, string> = body;

        // Upsert each key
        await Promise.all(
            Object.entries(updates).map(([key, value]) =>
                prisma.systemConfig.upsert({
                    where: { key },
                    update: { value: String(value) },
                    create: { key, value: String(value) },
                })
            )
        );

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[PATCH /api/admin/settings]", err);
        return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
}
