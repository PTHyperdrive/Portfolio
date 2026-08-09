import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { executeProvisionStep } from "@/lib/provisioning";

/**
 * POST /api/internal/provision/sweep — reap zombie provisioning jobs.
 *
 * A job stuck QUEUED/RUNNING with no step activity for 15 minutes means the
 * orchestrator died mid-run (n8n restart, network partition). Compensate it
 * (destroy the half-made VM, refund) and mark TIMED_OUT.
 *
 * Scheduled from n8n's cron node or any external cron. Same secret as the
 * step executor; exempted from CSRF in middleware.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STALE_MS = 15 * 60 * 1000;

function authorized(req: Request): boolean {
    const secret = process.env.N8N_CALLBACK_SECRET;
    const header = req.headers.get("x-n8n-callback-secret");
    if (!secret || !header) return false;
    const a = Buffer.from(header);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
    if (!authorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stale = await prisma.provisioningJob.findMany({
        where: {
            status: { in: ["QUEUED", "RUNNING"] },
            updatedAt: { lt: new Date(Date.now() - STALE_MS) },
        },
        select: { id: true },
        take: 20,
    });

    let compensated = 0, failed = 0;
    for (const job of stale) {
        const r = await executeProvisionStep(job.id, "compensate");
        if (r.ok) compensated++; else failed++;
        // compensate() sets COMPENSATED/FAILED; stamp the timeout cause on top.
        await prisma.provisioningJob.updateMany({
            where: { id: job.id, status: "COMPENSATED" },
            data: { status: "TIMED_OUT" },
        });
    }

    return NextResponse.json({ scanned: stale.length, compensated, failed });
}
