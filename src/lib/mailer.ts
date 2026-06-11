/**
 * SMTP mailer — sends transactional email through a relay/SMTP host you control.
 *
 * Env:
 *   SMTP_HOST       — relay hostname (e.g. mail.notrespond.com)
 *   SMTP_PORT       — 587 (STARTTLS) or 465 (implicit TLS); default 587
 *   SMTP_SECURE     — "true" for port 465 implicit TLS; default false
 *   SMTP_USER       — auth username (optional for an open internal relay)
 *   SMTP_PASS       — auth password
 *   MAIL_FROM       — From header (default "NotRespond <noreply@notrespond.com>")
 *   MAIL_REPLY_TO   — optional real inbox for replies (e.g. support@notrespond.com)
 *                     so users who reply to the no-reply address aren't lost.
 *
 * noreply@ needs NO mailbox — it's send-only; just verify the domain at your
 * relay so SPF/DKIM align. If SMTP_HOST is unset, sends throw (soft failure).
 */

import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null = null;

function getTransport(): Transporter {
    if (cached) return cached;
    const host = process.env.SMTP_HOST;
    if (!host) throw new Error("SMTP_HOST is not configured");

    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    cached = nodemailer.createTransport({
        host,
        port,
        secure,
        ...(user ? { auth: { user, pass } } : {}),
    });
    return cached;
}

export interface MailMessage {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

export async function sendMail(msg: MailMessage): Promise<void> {
    const from = process.env.MAIL_FROM || "NotRespond <noreply@notrespond.com>";
    const replyTo = process.env.MAIL_REPLY_TO; // optional real inbox for replies
    await getTransport().sendMail({
        from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(replyTo ? { replyTo } : {}),
        ...(msg.html ? { html: msg.html } : {}),
    });
}

/** True if an SMTP host is configured (so callers can short-circuit cleanly). */
export function mailerConfigured(): boolean {
    return !!process.env.SMTP_HOST;
}
