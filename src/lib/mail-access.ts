/**
 * Who may open which mailbox.
 *
 * One place decides this so every mail route enforces the same rule:
 *   - a user may open exactly the mailbox joined to their account;
 *   - an ADMIN may open any mailbox, and that access is audited by the caller.
 *
 * Mailboxes are always opened with Dovecot's master credentials rather than
 * the owner's password — the session already proves identity, and it means the
 * platform never has to store a reversible copy of a mailbox password.
 */

import { prisma } from "@/lib/db";
import { masterAuth, mailAdminConfigured } from "@/lib/mail-imap";

export interface MailboxAccess {
    address: string;
    mailboxId: string;
    /** Auth object to hand to the mail-imap helpers. */
    auth: { user: string; pass: string };
    /** True when an admin is opening someone else's mailbox. */
    impersonating: boolean;
    ownerUserId: string | null;
}

export type AccessFailure = { error: string; status: number };

/**
 * Resolve the mailbox this request may act on.
 *
 * `requestedAddress` is the admin "open another inbox" parameter; when absent
 * the caller's own mailbox is used.
 */
export async function resolveMailboxAccess(
    userId: string,
    role: string,
    requestedAddress?: string | null,
): Promise<MailboxAccess | AccessFailure> {
    if (!mailAdminConfigured()) {
        return {
            status: 503,
            error: "Mail access is not configured on the server yet.",
        };
    }

    const isAdmin = role === "ADMIN";

    if (requestedAddress && isAdmin) {
        const target = await prisma.mailMailbox.findUnique({
            where: { address: requestedAddress.toLowerCase() },
            select: { id: true, address: true, userId: true, active: true },
        });
        if (!target) return { status: 404, error: "No such mailbox." };
        return {
            address: target.address,
            mailboxId: target.id,
            auth: masterAuth(target.address),
            impersonating: target.userId !== userId,
            ownerUserId: target.userId,
        };
    }

    if (requestedAddress && !isAdmin) {
        // Do not disclose whether the address exists.
        return { status: 403, error: "You may only access your own mailbox." };
    }

    const own = await prisma.mailMailbox.findUnique({
        where: { userId },
        select: { id: true, address: true, active: true, userId: true },
    });
    if (!own) {
        return { status: 404, error: "NO_MAILBOX" };
    }
    if (!own.active) {
        return { status: 423, error: "This mailbox is suspended. Contact support." };
    }

    return {
        address: own.address,
        mailboxId: own.id,
        auth: masterAuth(own.address),
        impersonating: false,
        ownerUserId: own.userId,
    };
}

export function isAccessFailure(v: MailboxAccess | AccessFailure): v is AccessFailure {
    return (v as AccessFailure).status !== undefined;
}
