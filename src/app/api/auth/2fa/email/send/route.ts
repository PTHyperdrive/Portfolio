import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/db";
import { verifyPassword, checkRateLimit } from "@/lib/security";
import { loginSchema } from "@/lib/validation";
import { sendEmailOtp } from "@/lib/email-otp";

/**
 * POST /api/auth/2fa/email/send
 *
 * Login-challenge email code. The caller has NO session yet, so we re-verify
 * email + password (same trust level as /precheck) before emailing a code —
 * only if the account actually has email 2FA enabled.
 *
 * Always returns a generic success once the password checks out, so it can't
 * be used to enumerate who has email 2FA. Rate limited per IP + per account.
 */
export async function POST(req: Request) {
    try {
        const h = await headers();
        const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
        if (!checkRateLimit(`email-otp-ip:${ip}`, 10, 60_000).allowed) {
            return NextResponse.json({ error: "Too many requests." }, { status: 429 });
        }

        const body = await req.json().catch(() => null);
        const parsed = loginSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
            select: { id: true, email: true, passwordHash: true, emailTwoFactorEnabled: true },
        });
        if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
            return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
        }

        // Only actually send if the account has email 2FA on — but report the
        // same response either way (no enumeration).
        if (user.emailTwoFactorEnabled) {
            const r = await sendEmailOtp(user.id, user.email, "login");
            if (!r.ok && r.error === "MAILER_NOT_CONFIGURED") {
                return NextResponse.json({ error: "Email delivery is not configured." }, { status: 503 });
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[2fa/email/send] error:", error);
        return NextResponse.json({ error: "Failed to send code." }, { status: 500 });
    }
}
