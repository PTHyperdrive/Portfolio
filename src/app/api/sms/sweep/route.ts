import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { getSmsProvider } from "@/lib/sms-provider";

/**
 * POST /api/sms/sweep — expire stale WAITING rentals (TTL elapsed, no code).
 * Idempotent; rentals are also expired lazily when a user polls. Intended for
 * a periodic cron/admin call so abandoned numbers are released provider-side.
 */
export async function POST() {
    const { error } = await requireAdmin();
    if (error) return error;

    const now = new Date();
    const stale = await prisma.smsRental.findMany({
        where: { status: "WAITING", expiresAt: { lt: now } },
        select: { providerRentalId: true },
    });

    const provider = getSmsProvider();
    for (const r of stale) {
        if (r.providerRentalId) {
            try { await provider.cancel(r.providerRentalId); } catch { /* best-effort */ }
        }
    }

    const res = await prisma.smsRental.updateMany({
        where: { status: "WAITING", expiresAt: { lt: now } },
        data: { status: "EXPIRED" },
    });

    return NextResponse.json({ expired: res.count });
}
