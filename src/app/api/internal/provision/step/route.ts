import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { executeProvisionStep, PROVISION_STEPS } from "@/lib/provisioning";

/**
 * POST /api/internal/provision/step — the n8n step executor.
 *
 * Server-to-server only: n8n authenticates with x-n8n-callback-secret
 * (timing-safe compare, same posture as the SHKeeper webhook and cron
 * secrets). Exempted from the CSRF origin check in middleware.
 *
 * Responses:
 *   200 {ok:true, ...}     step done
 *   409 {ok:false, retry:true}  transient not-ready (guest agent) — retry
 *   422 {ok:false, ...}    step failed; workflow should branch to compensate
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300; // clone + waitForTask can take a while

const bodySchema = z.object({
    jobId: z.string().min(1).max(64),
    step: z.enum([...PROVISION_STEPS, "compensate"]),
});

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

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { jobId, step } = parsed.data;

    const result = await executeProvisionStep(jobId, step);

    if (result.ok) return NextResponse.json(result);
    if (result.retry) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result, { status: 422 });
}
