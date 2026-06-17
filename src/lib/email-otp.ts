/**
 * Email 2FA codes — generate, send, and verify single-use 6-digit codes.
 *
 * Codes are bcrypt-hashed at rest, expire in 10 minutes, are single-use
 * (consumedAt), and lock after 5 wrong guesses. Sends are rate limited per
 * account (1/60s, 5/hour) to prevent mail-bombing.
 */

import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { sendMail, mailerConfigured } from "@/lib/mailer";
import { checkRateLimit } from "@/lib/security";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type OtpPurpose = "login" | "setup";

function generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Generate a code, store it hashed (invalidating any prior unconsumed code of
 * the same purpose), and email it. Rate limited per account.
 */
export async function sendEmailOtp(
    userId: string,
    toEmail: string,
    purpose: OtpPurpose,
): Promise<{ ok: boolean; error?: string }> {
    if (!mailerConfigured()) return { ok: false, error: "MAILER_NOT_CONFIGURED" };

    if (!checkRateLimit(`email-otp-send:${userId}`, 1, 60_000).allowed) {
        return { ok: false, error: "TOO_SOON" };
    }
    if (!checkRateLimit(`email-otp-send-1h:${userId}`, 5, 60 * 60_000).allowed) {
        return { ok: false, error: "TOO_MANY" };
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);

    await prisma.$transaction([
        prisma.emailOtpCode.updateMany({
            where: { userId, purpose, consumedAt: null },
            data: { consumedAt: new Date() },
        }),
        prisma.emailOtpCode.create({
            data: { userId, purpose, codeHash, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
        }),
    ]);

    await sendMail({
        to: toEmail,
        subject: "Your NotRespond verification code",
        text: `Your NotRespond verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
        html: `<p>Your NotRespond verification code is <strong style="font-size:20px;letter-spacing:4px">${code}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>`,
    });

    return { ok: true };
}

/**
 * Verify a submitted code. Consumes it on success; counts wrong guesses and
 * locks the code after MAX_ATTEMPTS. Returns true only on an exact, live match.
 */
export async function verifyEmailOtp(
    userId: string,
    purpose: OtpPurpose,
    submitted: string,
): Promise<boolean> {
    if (!/^\d{6}$/.test(submitted)) return false;

    const rec = await prisma.emailOtpCode.findFirst({
        where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
    });
    if (!rec) return false;

    if (rec.attempts >= MAX_ATTEMPTS) {
        await prisma.emailOtpCode.update({ where: { id: rec.id }, data: { consumedAt: new Date() } });
        return false;
    }

    const ok = await bcrypt.compare(submitted, rec.codeHash);
    if (!ok) {
        await prisma.emailOtpCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
        return false;
    }

    await prisma.emailOtpCode.update({ where: { id: rec.id }, data: { consumedAt: new Date() } });
    return true;
}
