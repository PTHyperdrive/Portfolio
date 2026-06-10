import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import speakeasy from "speakeasy";
import { audit } from "@/lib/audit";
import { safeDecryptTotpSecret } from "@/lib/totp-crypto";
import { checkRateLimit } from "@/lib/security";

/**
 * POST /api/auth/2fa/verify
 *
 * Verifies a 6-digit TOTP token against the user's stored base32 secret.
 * If valid, permanently enables 2FA on the account.
 *
 * Rate limited: 5 attempts per 60 seconds per user (prevents brute-force).
 *
 * Body: { token: string }
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        // ── Rate limit: 5 attempts per 60 seconds per user ────────────
        const rl = checkRateLimit(`2fa-verify:${userId}`, 5, 60_000);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: "Too many verification attempts. Please try again later.", retryAfterMs: rl.resetIn },
                { status: 429 },
            );
        }

        // ── Parse body ───────────────────────────────────────────────────
        let body: Record<string, unknown> = {};
        try { body = await req.json(); } catch { /* invalid JSON body */ }

        const token = (body.token as string | undefined)?.trim();
        if (!token || !/^\d{6}$/.test(token)) {
            return NextResponse.json(
                { error: "A valid 6-digit authenticator code is required" },
                { status: 400 }
            );
        }

        // ── Fetch the stored secret ──────────────────────────────────────
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { twoFactorSecret: true, twoFactorEnabled: true },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (!user.twoFactorSecret) {
            return NextResponse.json(
                { error: "No 2FA setup found. Please generate a QR code first." },
                { status: 400 }
            );
        }

        // ── Verify the TOTP token ────────────────────────────────────────
        const decryptedSecret = safeDecryptTotpSecret(user.twoFactorSecret);
        const isValid = speakeasy.totp.verify({
            secret: decryptedSecret,
            encoding: "base32",
            token,
        });

        if (!isValid) {
            return NextResponse.json(
                { error: "Invalid authenticator code." },
                { status: 400 }
            );
        }

        // ── Enable 2FA ───────────────────────────────────────────────────
        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorEnabled: true },
        });

        // ISO 27001: Audit 2FA enablement
        void audit({
            userId,
            action: "TFA_ENABLED",
            resourceType: "UserAccount",
            resourceId: userId,
            req,
        });

        return NextResponse.json({
            success: true,
            message: "Two-factor authentication has been enabled successfully.",
        });
    } catch (error) {
        console.error("2FA verify error:", error);
        return NextResponse.json(
            { error: "Failed to verify 2FA token" },
            { status: 500 }
        );
    }
}
