import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * POST /api/internal/mail/unrouted — reported by the catch-all scanner on the
 * mail VM (10.12.0.5) when a message arrives for an address with no mailbox.
 *
 * Server-to-server only, authenticated by x-mail-reporter-secret (same
 * posture as the n8n callback and the cron secrets); exempted from the CSRF
 * origin check in middleware.
 *
 * Idempotent per recipient: repeat reports bump messageCount rather than
 * creating duplicate prompts, so a busy address is one admin decision.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
    recipient: z.string().trim().email().max(255),
    // Nullable, not just optional: the reporter sends an explicit null when it
    // cannot index the message (no usable Message-ID, which is normal for
    // scripted senders). Rejecting null lost those reports outright — the
    // reporter had already advanced its log offset, so they were never retried.
    sender: z.string().trim().max(255).nullable().optional(),
    subject: z.string().trim().max(255).nullable().optional(),
});

function authorized(req: Request): boolean {
    const secret = process.env.MAIL_REPORTER_SECRET;
    const header = req.headers.get("x-mail-reporter-secret");
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

    const recipient = parsed.data.recipient.toLowerCase();
    const domainName = recipient.split("@")[1];

    const domain = await prisma.mailDomain.findUnique({
        where: { domain: domainName }, select: { id: true },
    });
    if (!domain) {
        // Mail for a domain we do not host — nothing an admin can act on.
        return NextResponse.json({ ignored: "unknown domain" });
    }

    // A mailbox may have been created between delivery and this report.
    const existing = await prisma.mailMailbox.findUnique({
        where: { address: recipient }, select: { id: true },
    });
    if (existing) return NextResponse.json({ ignored: "mailbox exists" });

    const now = new Date();
    await prisma.mailUnrouted.upsert({
        where: { recipient },
        create: {
            domainId: domain.id,
            recipient,
            lastSender: parsed.data.sender ?? null,
            lastSubject: parsed.data.subject ?? null,
        },
        update: {
            messageCount: { increment: 1 },
            lastSeenAt: now,
            lastSender: parsed.data.sender ?? undefined,
            lastSubject: parsed.data.subject ?? undefined,
            // A new message re-opens a prompt an admin previously dismissed.
            resolved: false,
            resolvedAt: null,
        },
    });

    return NextResponse.json({ ok: true });
}
