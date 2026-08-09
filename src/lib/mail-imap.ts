/**
 * IMAP access to the mail server (10.12.0.6).
 *
 * The browser never speaks IMAP — every call here runs server-side, so the
 * mail host stays on the private segment and mailbox credentials never reach
 * the client. Connections are opened per request and closed in a finally;
 * mail UIs are bursty and a pooled IMAP connection per user would pin far
 * more sockets than it saves.
 *
 * Admin impersonation ("log in to another inbox") uses Dovecot's master-user
 * mechanism: authenticating as "<mailbox>*<masteruser>" with the master
 * password opens that mailbox without knowing — or resetting — the owner's
 * password. That is why deleting a user's password is never necessary to
 * support them, and why every such login is audited by the caller.
 */

import { ImapFlow, type ImapFlowOptions } from "imapflow";
import { simpleParser } from "mailparser";

const MAIL_HOST = process.env.MAIL_SERVER_HOST || "10.12.0.6";
const MAIL_IMAP_PORT = parseInt(process.env.MAIL_IMAP_PORT || "143", 10);

/** True when the master credentials needed for admin impersonation exist. */
export function mailAdminConfigured(): boolean {
    return !!process.env.MAIL_MASTER_USER && !!process.env.MAIL_MASTER_PASSWORD;
}

export function mailServerConfigured(): boolean {
    return !!process.env.MAIL_SERVER_HOST;
}

function baseOptions(): Omit<ImapFlowOptions, "auth"> {
    return {
        host: MAIL_HOST,
        port: MAIL_IMAP_PORT,
        // STARTTLS on the private segment; the cert is self-signed until
        // Let's Encrypt is wired up, so verification is off deliberately.
        secure: false,
        tls: { rejectUnauthorized: false },
        logger: false,
        // Fail fast — a hung mail host must not hold a Next.js request open.
        greetingTimeout: 8000,
        socketTimeout: 30000,
        connectionTimeout: 10000,
    };
}

/** Credentials for a mailbox the caller owns. */
export function ownerAuth(address: string, password: string) {
    return { user: address, pass: password };
}

/**
 * Credentials that open someone else's mailbox as an administrator.
 * Requires MAIL_MASTER_USER/MAIL_MASTER_PASSWORD and Dovecot's master passdb.
 */
export function masterAuth(address: string) {
    const master = process.env.MAIL_MASTER_USER!;
    const pass = process.env.MAIL_MASTER_PASSWORD!;
    return { user: `${address}*${master}`, pass };
}

export interface MessageSummary {
    uid: number;
    seq: number;
    subject: string;
    from: string;
    fromName: string;
    to: string;
    date: string | null;
    seen: boolean;
    flagged: boolean;
    hasAttachments: boolean;
    size: number;
    preview: string;
}

export interface MailAttachment {
    /** Position in the parsed attachment list — the download handle. */
    index: number;
    filename: string;
    contentType: string;
    size: number;
    /** Content-ID for inline parts, so HTML bodies can resolve cid: images. */
    cid: string | null;
    /** True for parts referenced by the HTML body rather than listed as files. */
    inline: boolean;
}

export interface MessageDetail extends MessageSummary {
    text: string;
    html: string | null;
    attachments: MailAttachment[];
}

export interface MailboxStats {
    exists: number;
    unseen: number;
    mailboxes: { path: string; name: string; exists: number; unseen: number }[];
}

type Auth = { user: string; pass: string };

/**
 * Open a connection, run the callback, always close.
 *
 * The `error` listener is not optional. ImapFlow is an EventEmitter, and an
 * emitted `error` with no listener is rethrown by Node as an uncaught
 * exception — which takes the whole Next.js process down, dropping every
 * in-flight request, not just this one. Socket timeouts fire asynchronously
 * and routinely arrive *after* the request has already been answered, so
 * there is no promise left to reject onto. Absorbing them here is the only
 * place that can be done.
 */
async function withClient<T>(
    auth: Auth,
    fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
    const client = new ImapFlow({ ...baseOptions(), auth });

    // Attach before connect(): a greeting or TLS failure can emit during it.
    client.on("error", err => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[mail-imap] connection error (absorbed): ${message}`);
    });

    await client.connect();
    try {
        return await fn(client);
    } finally {
        // logout() can throw if the peer already dropped; never mask the
        // real result (or the real error) with a teardown failure.
        try { await client.logout(); } catch { /* already gone */ }
        // logout() is a no-op on a half-dead socket. close() releases the
        // handle so a timeout cannot fire against an abandoned connection.
        try { client.close(); } catch { /* already closed */ }
    }
}

function addressText(value: unknown): { text: string; name: string } {
    const parsed = value as { value?: { address?: string; name?: string }[] } | undefined;
    const first = parsed?.value?.[0];
    return { text: first?.address ?? "", name: first?.name ?? "" };
}

/** Folder list plus unread counts. Runs on a caller-supplied connection. */
async function fetchMailboxes(client: ImapFlow): Promise<MailboxStats> {
    {
        const boxes = await client.list();
        const out: MailboxStats["mailboxes"] = [];
        let inboxExists = 0;
        let inboxUnseen = 0;

        for (const box of boxes) {
            if (box.flags?.has("\\Noselect")) continue;
            try {
                const status = await client.status(box.path, { messages: true, unseen: true });
                out.push({
                    path: box.path,
                    name: box.name,
                    exists: status.messages ?? 0,
                    unseen: status.unseen ?? 0,
                });
                if (box.path.toUpperCase() === "INBOX") {
                    inboxExists = status.messages ?? 0;
                    inboxUnseen = status.unseen ?? 0;
                }
            } catch { /* a folder we cannot status is not worth failing over */ }
        }

        return { exists: inboxExists, unseen: inboxUnseen, mailboxes: out };
    }
}

/** Folder list plus unread counts, for the sidebar. */
export async function listMailboxes(auth: Auth): Promise<MailboxStats> {
    return withClient(auth, fetchMailboxes);
}

/** Newest-first page of a folder. Runs on a caller-supplied connection. */
async function fetchMessages(
    client: ImapFlow,
    mailbox: string,
    limit: number,
    before?: number,
): Promise<MessageSummary[]> {
    {
        const lock = await client.getMailboxLock(mailbox);
        try {
            const status = client.mailbox;
            const total = typeof status === "object" ? status.exists : 0;
            if (!total) return [];

            // Walk back from the newest message; `before` pages further back.
            const top = before && before > 1 ? before - 1 : total;
            const bottom = Math.max(1, top - limit + 1);
            if (top < 1) return [];

            const out: MessageSummary[] = [];
            for await (const msg of client.fetch(
                `${bottom}:${top}`,
                { uid: true, flags: true, envelope: true, size: true, bodyStructure: true },
            )) {
                const env = msg.envelope;
                const from = addressText(env?.from ? { value: env.from } : undefined);
                const to = addressText(env?.to ? { value: env.to } : undefined);
                out.push({
                    uid: msg.uid,
                    seq: msg.seq,
                    subject: env?.subject || "(no subject)",
                    from: from.text,
                    fromName: from.name,
                    to: to.text,
                    date: env?.date ? new Date(env.date).toISOString() : null,
                    seen: msg.flags?.has("\\Seen") ?? false,
                    flagged: msg.flags?.has("\\Flagged") ?? false,
                    hasAttachments: hasAttachment(msg.bodyStructure),
                    size: msg.size ?? 0,
                    preview: "",
                });
            }
            return out.reverse();
        } finally {
            lock.release();
        }
    }
}

/** Newest-first page of a folder. */
export async function listMessages(
    auth: Auth,
    mailbox = "INBOX",
    limit = 50,
    before?: number,
): Promise<MessageSummary[]> {
    return withClient(auth, client => fetchMessages(client, mailbox, limit, before));
}

/**
 * Everything the inbox view needs, over a single connection.
 *
 * The route previously called listMessages() and listMailboxes() in parallel,
 * which opened two connections and paid the authentication cost twice — and
 * doubled the load on Dovecot's auth for every page view. Running both on one
 * connection halves that. They are sequential rather than concurrent on
 * purpose: IMAP is a single-command-at-a-time protocol per connection, and
 * the folder STATUS calls must not interleave with the message fetch.
 */
export async function listInboxView(
    auth: Auth,
    mailbox = "INBOX",
    limit = 50,
    before?: number,
): Promise<{ messages: MessageSummary[]; stats: MailboxStats }> {
    return withClient(auth, async client => {
        const messages = await fetchMessages(client, mailbox, limit, before);
        const stats = await fetchMailboxes(client);
        return { messages, stats };
    });
}

/** Does this body structure contain a non-inline part? */
function hasAttachment(node: unknown): boolean {
    const n = node as { disposition?: string; childNodes?: unknown[] } | undefined;
    if (!n) return false;
    if (n.disposition && n.disposition.toLowerCase() === "attachment") return true;
    return (n.childNodes ?? []).some(child => hasAttachment(child));
}

/** Full message body, marked read as a side effect of opening it. */
export async function getMessage(
    auth: Auth,
    uid: number,
    mailbox = "INBOX",
): Promise<MessageDetail | null> {
    return withClient(auth, async client => {
        const lock = await client.getMailboxLock(mailbox);
        try {
            const msg = await client.fetchOne(String(uid), { source: true, flags: true, uid: true }, { uid: true });
            if (!msg || !msg.source) return null;

            const parsed = await simpleParser(msg.source);
            const from = parsed.from?.value?.[0];
            const to = parsed.to
                ? (Array.isArray(parsed.to) ? parsed.to[0]?.value?.[0] : parsed.to.value?.[0])
                : undefined;

            // Opening a message marks it read, matching every mail client.
            try { await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }); }
            catch { /* read-only mailbox; not worth failing the read */ }

            return {
                uid,
                seq: msg.seq,
                subject: parsed.subject || "(no subject)",
                from: from?.address ?? "",
                fromName: from?.name ?? "",
                to: to?.address ?? "",
                date: parsed.date ? parsed.date.toISOString() : null,
                seen: true,
                flagged: msg.flags?.has("\\Flagged") ?? false,
                hasAttachments: (parsed.attachments?.length ?? 0) > 0,
                size: msg.size ?? 0,
                preview: (parsed.text ?? "").slice(0, 200),
                text: parsed.text ?? "",
                html: typeof parsed.html === "string" ? parsed.html : null,
                // Index is the download handle. mailparser preserves source
                // order, and getAttachment() re-parses the same message, so the
                // index is stable for as long as the message exists.
                attachments: (parsed.attachments ?? []).map((a, index) => ({
                    index,
                    filename: a.filename ?? `attachment-${index + 1}`,
                    contentType: a.contentType ?? "application/octet-stream",
                    size: a.size ?? 0,
                    cid: a.cid ?? null,
                    inline: a.contentDisposition === "inline" || Boolean(a.cid),
                })),
            };
        } finally {
            lock.release();
        }
    });
}

/**
 * Fetch one attachment's bytes.
 *
 * Reads the message source and re-parses rather than trusting a cached part
 * number: IMAP part numbering varies between servers for nested multiparts,
 * and a wrong guess silently returns the wrong file. Re-parsing costs a fetch
 * but cannot mis-address the part.
 *
 * Deliberately does not mark the message read — downloading a file is not the
 * same as opening the message, and a download should not mutate mailbox state.
 */
export async function getAttachment(
    auth: Auth,
    uid: number,
    index: number,
    mailbox = "INBOX",
): Promise<{ filename: string; contentType: string; content: Buffer } | null> {
    return withClient(auth, async client => {
        const lock = await client.getMailboxLock(mailbox);
        try {
            const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
            if (!msg || !msg.source) return null;

            const parsed = await simpleParser(msg.source);
            const part = parsed.attachments?.[index];
            if (!part) return null;

            return {
                filename: part.filename ?? `attachment-${index + 1}`,
                contentType: part.contentType ?? "application/octet-stream",
                content: part.content as Buffer,
            };
        } finally {
            lock.release();
        }
    });
}

/** Move to Trash, or expunge outright when already there. */
export async function deleteMessage(
    auth: Auth,
    uid: number,
    mailbox = "INBOX",
): Promise<boolean> {
    return withClient(auth, async client => {
        const lock = await client.getMailboxLock(mailbox);
        try {
            if (mailbox.toUpperCase() === "TRASH") {
                return await client.messageDelete(String(uid), { uid: true });
            }
            try {
                return await client.messageMove(String(uid), "Trash", { uid: true }) !== false;
            } catch {
                // No Trash folder on this account — fall back to a real delete
                // rather than silently doing nothing.
                return await client.messageDelete(String(uid), { uid: true });
            }
        } finally {
            lock.release();
        }
    });
}

/** Empty every message from a folder — used when a user deletes their mailbox. */
export async function purgeMailbox(auth: Auth, mailbox = "INBOX"): Promise<number> {
    return withClient(auth, async client => {
        const lock = await client.getMailboxLock(mailbox);
        try {
            const status = client.mailbox;
            const total = typeof status === "object" ? status.exists : 0;
            if (!total) return 0;
            await client.messageDelete(`1:${total}`);
            return total;
        } finally {
            lock.release();
        }
    });
}

/** Verify a mailbox password by attempting a login. */
export async function verifyMailboxLogin(address: string, password: string): Promise<boolean> {
    try {
        await withClient(ownerAuth(address, password), async () => true);
        return true;
    } catch {
        return false;
    }
}
