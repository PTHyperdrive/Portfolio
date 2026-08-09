import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveMailboxAccess, isAccessFailure } from "@/lib/mail-access";
import { getMessage, deleteMessage } from "@/lib/mail-imap";

export const dynamic = "force-dynamic";

async function access(userId: string, asAddress: string | null) {
    const role = (await prisma.user.findUnique({
        where: { id: userId }, select: { role: true },
    }))?.role ?? "USER";
    return resolveMailboxAccess(userId, role, asAddress);
}

/** GET /api/mail/messages/[uid] — full message; marks it read. */
export async function GET(req: Request, { params }: { params: Promise<{ uid: string }> }) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const { uid: uidRaw } = await params;
    const uid = parseInt(uidRaw, 10);
    if (!Number.isFinite(uid)) {
        return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
    }

    const url = new URL(req.url);
    const folder = url.searchParams.get("mailbox") || "INBOX";
    const acc = await access(userId, url.searchParams.get("as"));
    if (isAccessFailure(acc)) {
        return NextResponse.json({ error: acc.error }, { status: acc.status });
    }

    if (acc.impersonating) {
        void audit({
            userId,
            action: "MAILBOX_ADMIN_ACCESS",
            resourceType: "MailMailbox",
            resourceId: acc.mailboxId,
            metadata: { address: acc.address, folder, uid, action: "read" },
            req,
        });
    }

    try {
        const message = await getMessage(acc.auth, uid, folder);
        if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });
        return NextResponse.json({ message, impersonating: acc.impersonating });
    } catch (err) {
        console.error("[api/mail/messages/uid] IMAP failed:", err);
        return NextResponse.json({ error: "Could not reach the mail server." }, { status: 502 });
    }
}

/** DELETE /api/mail/messages/[uid] — move to Trash (or expunge if already there). */
export async function DELETE(req: Request, { params }: { params: Promise<{ uid: string }> }) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const { uid: uidRaw } = await params;
    const uid = parseInt(uidRaw, 10);
    if (!Number.isFinite(uid)) {
        return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
    }

    const url = new URL(req.url);
    const folder = url.searchParams.get("mailbox") || "INBOX";
    const acc = await access(userId, url.searchParams.get("as"));
    if (isAccessFailure(acc)) {
        return NextResponse.json({ error: acc.error }, { status: acc.status });
    }

    try {
        const ok = await deleteMessage(acc.auth, uid, folder);
        void audit({
            userId,
            action: "MAIL_MESSAGE_DELETE",
            resourceType: "MailMailbox",
            resourceId: acc.mailboxId,
            metadata: { address: acc.address, folder, uid, byAdmin: acc.impersonating },
            req,
        });
        return NextResponse.json({ ok });
    } catch (err) {
        console.error("[api/mail/messages/uid] delete failed:", err);
        return NextResponse.json({ error: "Could not reach the mail server." }, { status: 502 });
    }
}
