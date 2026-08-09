import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveMailboxAccess, isAccessFailure } from "@/lib/mail-access";
import { listInboxView } from "@/lib/mail-imap";

/**
 * GET /api/mail/messages
 *
 * Query: mailbox (folder, default INBOX), limit, before (seq for paging),
 *        as (admin only — open another user's mailbox).
 *
 * Returns { mailbox: null } with 404 NO_MAILBOX when the caller has no inbox,
 * which the UI turns into the "create your inbox" prompt.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const url = new URL(req.url);
    const folder = url.searchParams.get("mailbox") || "INBOX";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
    const beforeRaw = parseInt(url.searchParams.get("before") || "", 10);
    const before = Number.isFinite(beforeRaw) ? beforeRaw : undefined;
    const asAddress = url.searchParams.get("as");

    const role = (await prisma.user.findUnique({
        where: { id: userId }, select: { role: true },
    }))?.role ?? "USER";

    const access = await resolveMailboxAccess(userId, role, asAddress);
    if (isAccessFailure(access)) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (access.impersonating) {
        void audit({
            userId,
            action: "MAILBOX_ADMIN_ACCESS",
            resourceType: "MailMailbox",
            resourceId: access.mailboxId,
            metadata: { address: access.address, folder, action: "list" },
            req,
        });
    }

    try {
        // One connection, not two — see listInboxView().
        const { messages, stats } = await listInboxView(access.auth, folder, limit, before);
        return NextResponse.json({
            address: access.address,
            impersonating: access.impersonating,
            folder,
            messages,
            folders: stats.mailboxes,
            unseen: stats.unseen,
            total: stats.exists,
        });
    } catch (err) {
        console.error("[api/mail/messages] IMAP failed:", err);
        return NextResponse.json(
            { error: "Could not reach the mail server." },
            { status: 502 },
        );
    }
}
