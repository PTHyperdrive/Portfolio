import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import {
    USER_MAIL_DOMAIN,
    deriveLocalPart,
    resolveFreeLocalPart,
    createMailbox,
    generateMailboxPassword,
} from "@/lib/mail-accounts";
import { masterAuth, mailAdminConfigured } from "@/lib/mail-imap";
import { purgeMailbox } from "@/lib/mail-imap";

/**
 * The caller's own mailbox.
 *
 * GET returns null when they have none — that is the signal the UI uses to
 * show the "you don't have an inbox yet" prompt rather than an error.
 */
export async function GET() {
    const { userId, error } = await requireUser();
    if (error) return error;

    const mailbox = await prisma.mailMailbox.findUnique({
        where: { userId },
        select: {
            id: true, address: true, localPart: true, quotaMb: true,
            active: true, createdAt: true, lastLoginAt: true,
            domain: { select: { domain: true } },
        },
    });

    return NextResponse.json({
        mailbox,
        /** The domain a self-service mailbox would be created on. */
        availableDomain: USER_MAIL_DOMAIN,
        serverConfigured: mailAdminConfigured(),
    });
}

/**
 * POST — create the caller's mailbox.
 *
 * The address is derived from their account rather than chosen, per the
 * operator's policy, so there is no request body. The generated password is
 * returned exactly once, for setting up a phone or desktop mail client; only
 * its bcrypt hash is stored.
 */
export async function POST(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const existing = await prisma.mailMailbox.findUnique({
        where: { userId },
        select: { address: true },
    });
    if (existing) {
        return NextResponse.json(
            { error: `You already have a mailbox: ${existing.address}` },
            { status: 409 },
        );
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const domain = await prisma.mailDomain.findUnique({
        where: { domain: USER_MAIL_DOMAIN },
        select: { id: true, active: true, adminOnly: true },
    });
    if (!domain?.active) {
        return NextResponse.json(
            { error: "Mail is not available yet. Please try again later." },
            { status: 503 },
        );
    }
    if (domain.adminOnly) {
        return NextResponse.json(
            { error: "Mailboxes on this domain are created by an administrator." },
            { status: 403 },
        );
    }

    const base = deriveLocalPart(user.email, userId);
    const localPart = await resolveFreeLocalPart(base, domain.id, userId);
    if (!localPart) {
        return NextResponse.json(
            { error: "Could not allocate an address. Please contact support." },
            { status: 409 },
        );
    }

    const password = generateMailboxPassword();
    const result = await createMailbox({
        userId,
        domain: USER_MAIL_DOMAIN,
        localPart,
        password,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    void audit({
        userId,
        action: "MAILBOX_CREATE",
        resourceType: "MailMailbox",
        resourceId: result.mailbox.id,
        metadata: { address: result.mailbox.address, selfService: true },
        req,
    });

    return NextResponse.json({
        mailbox: result.mailbox,
        // Shown once. Not recoverable — a reset issues a new one.
        password,
        imap: { host: "mail.notrespond.com", port: 143, starttls: true },
        smtp: { host: "mail.notrespond.com", port: 587, starttls: true },
    }, { status: 201 });
}

/**
 * DELETE — remove the caller's own mailbox and everything in it.
 * Irreversible; the UI confirms first.
 */
export async function DELETE(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const mailbox = await prisma.mailMailbox.findUnique({
        where: { userId },
        select: { id: true, address: true },
    });
    if (!mailbox) {
        return NextResponse.json({ error: "You have no mailbox." }, { status: 404 });
    }

    // Best-effort message purge before the row goes; losing the row is what
    // actually stops delivery, so a purge failure must not block deletion.
    if (mailAdminConfigured()) {
        try { await purgeMailbox(masterAuth(mailbox.address), "INBOX"); }
        catch (err) { console.error("[api/mail/mailbox] purge failed:", err); }
    }

    await prisma.mailMailbox.delete({ where: { id: mailbox.id } });

    void audit({
        userId,
        action: "MAILBOX_DELETE",
        resourceType: "MailMailbox",
        resourceId: mailbox.id,
        metadata: { address: mailbox.address, selfService: true },
        req,
    });

    return NextResponse.json({ ok: true });
}
