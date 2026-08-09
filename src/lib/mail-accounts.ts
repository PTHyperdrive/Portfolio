/**
 * Mailbox provisioning — the rules that turn a platform account into an inbox.
 *
 * The Prisma tables ARE the mail server's config (Postfix and Dovecot read
 * MailDomain/MailMailbox/MailAlias over MySQL), so everything here is an
 * ordinary DB write: create a row and the mailbox works within seconds, no
 * deploy and no sync job. See prisma/schema.prisma for the contract.
 *
 * Address policy, per the operator's decision:
 *   - The local part is derived from the account, not chosen by the user.
 *   - Users may only hold a mailbox on a non-adminOnly domain
 *     (mail.notrespond.com). Admins may create on any domain, including
 *     notrespond.com.
 *   - One mailbox per user, enforced by MailMailbox.userId being unique.
 */

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/security";
import type { MailboxKind } from "@/generated/prisma";

/** Domain users self-serve on. Admin-only domains are configured per row. */
export const USER_MAIL_DOMAIN =
    process.env.MAIL_USER_DOMAIN || "mail.notrespond.com";
/** Primary domain — admin mailboxes and the no-reply sender live here. */
export const PRIMARY_MAIL_DOMAIN =
    process.env.MAIL_PRIMARY_DOMAIN || "notrespond.com";

/** Local parts nobody may self-serve — they carry authority or are reserved. */
const RESERVED_LOCAL_PARTS = new Set([
    "admin", "administrator", "root", "postmaster", "hostmaster", "webmaster",
    "abuse", "security", "noreply", "no-reply", "support", "billing", "sales",
    "info", "contact", "help", "mail", "smtp", "imap", "catchall", "daemon",
    "mailer-daemon", "nobody", "system", "notrespond", "dmarc",
]);

/**
 * Turn an account into a mail local part.
 *
 * Derived from the signup email's local part (what a user would expect their
 * address to be), sanitised to RFC-safe characters. Falls back to the 8-char
 * user-id convention already used for subdomains and Nextcloud usernames.
 */
export function deriveLocalPart(email: string, userId: string): string {
    const raw = (email.split("@")[0] ?? "").toLowerCase();
    const cleaned = raw
        .replace(/\+.*$/, "")          // drop +tags
        .replace(/[^a-z0-9._-]/g, "")  // RFC-safe subset
        .replace(/^[._-]+|[._-]+$/g, "")
        .replace(/[._-]{2,}/g, ".")
        .slice(0, 40);

    if (cleaned.length < 3 || RESERVED_LOCAL_PARTS.has(cleaned)) {
        return `u${userId.slice(0, 8).toLowerCase()}`;
    }
    return cleaned;
}

/** Is this local part acceptable at all? (shape only, not availability) */
export function isValidLocalPart(localPart: string): boolean {
    return /^[a-z0-9]([a-z0-9._-]{1,38}[a-z0-9])$/.test(localPart);
}

export function isReserved(localPart: string): boolean {
    return RESERVED_LOCAL_PARTS.has(localPart.toLowerCase());
}

/**
 * Find a free local part, extending deterministically on collision:
 * "vinhky" → "vinhky.<4-char id>" → "vinhky.<8-char id>".
 * Deterministic so a retry after a failure lands on the same address.
 */
export async function resolveFreeLocalPart(
    base: string,
    domainId: string,
    userId: string,
): Promise<string | null> {
    const candidates = [
        base,
        `${base}.${userId.slice(0, 4).toLowerCase()}`,
        `${base}.${userId.slice(0, 8).toLowerCase()}`,
        `u${userId.slice(0, 8).toLowerCase()}`,
    ];

    for (const candidate of candidates) {
        if (!isValidLocalPart(candidate)) continue;
        const taken = await prisma.mailMailbox.findFirst({
            where: { domainId, localPart: candidate },
            select: { id: true },
        });
        if (!taken) return candidate;
    }
    return null;
}

export interface CreateMailboxInput {
    userId?: string | null;
    domain: string;
    localPart: string;
    /** Plaintext; hashed with the same bcrypt settings Dovecot reads as BLF-CRYPT. */
    password: string;
    quotaMb?: number;
    kind?: MailboxKind;
}

export type CreateMailboxResult =
    | { ok: true; mailbox: { id: string; address: string } }
    | { ok: false; error: string; status: number };

/**
 * Create a mailbox row. Postfix/Dovecot pick it up on their next lookup —
 * no restart, no file to write.
 */
export async function createMailbox(
    input: CreateMailboxInput,
): Promise<CreateMailboxResult> {
    const localPart = input.localPart.toLowerCase().trim();

    if (!isValidLocalPart(localPart)) {
        return {
            ok: false,
            status: 400,
            error: "Address must be 3-40 characters: letters, numbers, dot, dash or underscore.",
        };
    }

    const domain = await prisma.mailDomain.findUnique({
        where: { domain: input.domain },
        select: { id: true, active: true },
    });
    if (!domain?.active) {
        return { ok: false, status: 400, error: "That mail domain is not available." };
    }

    const address = `${localPart}@${input.domain}`;

    // Unique constraints cover the race; this is just a friendlier message.
    const clash = await prisma.mailMailbox.findFirst({
        where: { OR: [{ address }, { domainId: domain.id, localPart }] },
        select: { id: true },
    });
    if (clash) {
        return { ok: false, status: 409, error: `${address} is already taken.` };
    }

    try {
        const mailbox = await prisma.mailMailbox.create({
            data: {
                userId: input.userId ?? null,
                domainId: domain.id,
                localPart,
                address,
                passwordHash: await hashPassword(input.password),
                quotaMb: input.quotaMb ?? 1024,
                kind: input.kind ?? "USER",
            },
            select: { id: true, address: true },
        });

        // Mail already delivered to this address (held by the catch-all) is no
        // longer "unrouted" — clear the admin prompt.
        await prisma.mailUnrouted.updateMany({
            where: { recipient: address, resolved: false },
            data: { resolved: true, resolvedAt: new Date() },
        });

        return { ok: true, mailbox };
    } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === "P2002") {
            return {
                ok: false,
                status: 409,
                error: "That address (or your mailbox) already exists.",
            };
        }
        throw err;
    }
}

/** Generate a mailbox password: readable, and long enough to be safe. */
export function generateMailboxPassword(): string {
    // Ambiguous glyphs removed — these get read off a screen and retyped
    // into a phone mail client.
    const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint32Array(20);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}
