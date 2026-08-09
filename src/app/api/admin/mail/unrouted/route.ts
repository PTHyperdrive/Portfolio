import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/mail/unrouted — addresses that received mail but have no
 * mailbox. The catch-all reporter on the mail VM writes these rows; the admin
 * UI turns each one into a "create an inbox for this address?" prompt.
 */
export async function GET(req: Request) {
    const { error } = await requireAdmin();
    if (error) return error;

    const includeResolved = new URL(req.url).searchParams.get("all") === "true";

    const rows = await prisma.mailUnrouted.findMany({
        where: includeResolved ? {} : { resolved: false },
        orderBy: { lastSeenAt: "desc" },
        take: 200,
        select: {
            id: true, recipient: true, lastSender: true, lastSubject: true,
            messageCount: true, firstSeenAt: true, lastSeenAt: true,
            resolved: true, domain: { select: { domain: true, id: true } },
        },
    });

    return NextResponse.json({ unrouted: rows, pending: rows.filter(r => !r.resolved).length });
}

const patchSchema = z.object({
    id: z.string().min(1).max(64),
    /** Dismiss without creating a mailbox (spam, typo, one-off). */
    resolved: z.boolean(),
});

/** PATCH — dismiss (or re-open) a prompt. */
export async function PATCH(req: Request) {
    const { userId: adminId, error } = await requireAdmin();
    if (error) return error;

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { id, resolved } = parsed.data;

    const row = await prisma.mailUnrouted.findUnique({
        where: { id }, select: { recipient: true },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.mailUnrouted.update({
        where: { id },
        data: { resolved, resolvedAt: resolved ? new Date() : null },
    });

    void audit({
        userId: adminId!,
        action: "MAILBOX_ADMIN_ACCESS",
        resourceType: "MailUnrouted",
        resourceId: id,
        metadata: { recipient: row.recipient, resolved, action: "dismiss-prompt" },
        req,
    });

    return NextResponse.json({ ok: true });
}
