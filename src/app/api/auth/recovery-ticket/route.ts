import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/db";
import { verifyPassword, checkRateLimit } from "@/lib/security";
import { loginSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { sendMail, mailerConfigured } from "@/lib/mailer";

/**
 * POST /api/auth/recovery-ticket
 *
 * The "I've lost access to every 2FA method" escape hatch. The caller has NO
 * session (they can't pass 2FA), so we re-verify email + password — the same
 * trust level as /precheck — to prove account ownership before acting.
 *
 * On success it files a high-priority support ticket ON THE USER'S ACCOUNT and
 * (if SMTP is configured) emails support. Restricted to accounts that actually
 * have 2FA enabled, so it can't be used as an anonymous ticket spammer. Always
 * returns a generic success once the password checks out (no enumeration).
 *
 * Rate limited per IP and per account.
 */
export async function POST(req: Request) {
    try {
        const h = await headers();
        const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
        if (!checkRateLimit(`recovery-ticket-ip:${ip}`, 5, 60 * 60_000).allowed) {
            return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
        }

        const body = await req.json().catch(() => null);
        const parsed = loginSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
        }
        const note = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";

        const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
            select: { id: true, email: true, name: true, passwordHash: true, twoFactorEnabled: true, emailTwoFactorEnabled: true },
        });
        if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
            return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
        }

        // Per-account throttle (after auth so it can't be used to probe accounts).
        if (!checkRateLimit(`recovery-ticket:${user.id}`, 3, 24 * 60 * 60_000).allowed) {
            return NextResponse.json({ ok: true });
        }

        // Only meaningful for accounts that actually have 2FA — otherwise there's
        // nothing to be locked out of. Report generic success either way.
        const has2fa = user.twoFactorEnabled || user.emailTwoFactorEnabled;
        if (!has2fa) return NextResponse.json({ ok: true });

        const description =
            "Automated request: the account owner reports they cannot complete two-factor " +
            "authentication (authenticator, email code, and backup codes all unavailable) and " +
            "needs manual identity verification to regain access." +
            (note ? `\n\nUser note:\n${note}` : "");

        await prisma.ticket.create({
            data: {
                userId: user.id,
                title: "Account access — 2FA lockout / recovery",
                description,
                priority: "high",
            },
        });

        void audit({
            userId: user.id,
            action: "TFA_LOCKOUT_TICKET",
            resourceType: "UserAccount",
            resourceId: user.id,
            req,
        });

        if (mailerConfigured()) {
            const supportTo = process.env.MAIL_REPLY_TO || process.env.SUPPORT_EMAIL;
            if (supportTo) {
                await sendMail({
                    to: supportTo,
                    subject: "[2FA lockout] Account recovery request",
                    text:
                        `A 2FA lockout recovery ticket was filed.\n\n` +
                        `User: ${user.name ?? "—"} <${user.email}>\nUser ID: ${user.id}\n` +
                        (note ? `\nNote: ${note}\n` : ""),
                }).catch(() => { /* non-fatal — the ticket is already on record */ });
            }
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[recovery-ticket] error:", err);
        return NextResponse.json({ error: "Failed to submit request." }, { status: 500 });
    }
}
