import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveMailboxAccess, isAccessFailure } from "@/lib/mail-access";
import { getAttachment } from "@/lib/mail-imap";

/**
 * GET /api/mail/messages/[uid]/attachments/[index]
 *
 * Streams one attachment out of a message. Access is the same mailbox check
 * every other mail route uses, so an attachment is never reachable by anyone
 * who could not already open the message containing it.
 *
 * Attachments are served from IMAP on demand and never written to disk here —
 * the mail store stays the single copy, so nothing can drift or be orphaned.
 */

export const dynamic = "force-dynamic";

/**
 * Content types rendered inline by the browser.
 *
 * Everything else is forced to download. This is a security boundary, not a
 * convenience: serving attacker-supplied HTML or SVG inline from our origin
 * would execute script with access to the session cookie. SVG is markup, not
 * an image, and is deliberately absent from this list.
 */
const INLINE_SAFE = new Set([
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "application/pdf", "text/plain",
]);

/**
 * Strip anything that could break out of the Content-Disposition header.
 * A filename arrives from a remote sender and is fully attacker-controlled.
 */
function safeFilename(name: string): string {
    const cleaned = name
        .replace(/[\r\n"\\]/g, "")
        .replace(/[/\\]/g, "_")
        .trim();
    return cleaned.slice(0, 200) || "attachment";
}

export async function GET(
    req: Request,
    { params }: { params: Promise<{ uid: string; index: string }> },
) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const { uid: uidRaw, index: indexRaw } = await params;
    const uid = parseInt(uidRaw, 10);
    const index = parseInt(indexRaw, 10);

    if (!Number.isFinite(uid) || !Number.isFinite(index) || index < 0) {
        return NextResponse.json({ error: "Invalid attachment reference" }, { status: 400 });
    }

    const url = new URL(req.url);
    const folder = url.searchParams.get("mailbox") || "INBOX";

    const role = (await prisma.user.findUnique({
        where: { id: userId }, select: { role: true },
    }))?.role ?? "USER";

    const acc = await resolveMailboxAccess(userId, role, url.searchParams.get("as"));
    if (isAccessFailure(acc)) {
        return NextResponse.json({ error: acc.error }, { status: acc.status });
    }

    try {
        const file = await getAttachment(acc.auth, uid, index, folder);
        if (!file) {
            return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
        }

        void audit({
            userId,
            action: "MAIL_ATTACHMENT_DOWNLOAD",
            resourceType: "MailMailbox",
            resourceId: acc.mailboxId,
            metadata: {
                address: acc.address, folder, uid, index,
                filename: file.filename, bytes: file.content.length,
                byAdmin: acc.impersonating,
            },
            req,
        });

        const name = safeFilename(file.filename);
        const type = file.contentType.split(";")[0].trim().toLowerCase();
        const disposition = INLINE_SAFE.has(type) ? "inline" : "attachment";

        return new NextResponse(new Uint8Array(file.content), {
            headers: {
                "Content-Type": INLINE_SAFE.has(type) ? file.contentType : "application/octet-stream",
                "Content-Length": String(file.content.length),
                // RFC 5987 form carries non-ASCII names correctly; the plain
                // parameter stays for older clients.
                "Content-Disposition":
                    `${disposition}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
                // Attachments are private mail content — never cache shared.
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; sandbox",
            },
        });
    } catch (err) {
        console.error("[api/mail/attachment] IMAP failed:", err);
        return NextResponse.json({ error: "Could not reach the mail server." }, { status: 502 });
    }
}
