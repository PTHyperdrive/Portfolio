import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/db";
import { verifyPassword, checkRateLimit } from "@/lib/security";
import { loginSchema } from "@/lib/validation";

/**
 * POST /api/auth/precheck
 *
 * Validates email + password WITHOUT creating a session, and reports whether
 * this account requires a TOTP code to finish logging in. The login page uses
 * the result purely to decide whether to show the authenticator-code field.
 *
 * This endpoint is NOT the security boundary — the real 2FA gate lives in
 * NextAuth `authorize()` (src/lib/auth.ts), which independently rejects a
 * sign-in that lacks a valid code. Skipping the precheck cannot bypass 2FA.
 *
 * Returns:
 *   200 { ok: true, requires2fa: boolean }   — credentials valid
 *   401 { error }                            — invalid credentials
 *   429 { error }                            — rate limited
 */
export async function POST(req: Request) {
    try {
        const h = await headers();
        const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim()
            || h.get("x-real-ip")
            || "unknown";

        const rl = checkRateLimit(`precheck:${ip}`, 10, 60_000);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: "Too many attempts. Please try again shortly." },
                { status: 429 },
            );
        }

        const body = await req.json().catch(() => null);
        const parsed = loginSchema.safeParse(body);
        if (!parsed.success) {
            // Generic message — never reveal which field was wrong.
            return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
            select: {
                passwordHash: true,
                twoFactorEnabled: true,
                loginWith2FA: true,
                twoFactorSecret: true,
            },
        });

        if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
            return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
        }

        const requires2fa = !!(user.twoFactorEnabled && user.loginWith2FA && user.twoFactorSecret);

        return NextResponse.json({ ok: true, requires2fa });
    } catch (error) {
        console.error("[precheck] error:", error);
        return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
}
