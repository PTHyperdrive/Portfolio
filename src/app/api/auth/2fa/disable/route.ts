import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import speakeasy from "speakeasy";
import { audit } from "@/lib/audit";

/**
 * POST /api/auth/2fa/disable
 *
 * Disables 2FA for the authenticated user after verifying a valid TOTP
 * token from their authenticator app. Clears both twoFactorEnabled and
 * twoFactorSecret so a fresh key is generated if they re-enable later.
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

        // ── Fetch current 2FA status ─────────────────────────────────────
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { twoFactorEnabled: true, twoFactorSecret: true },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (!user.twoFactorEnabled || !user.twoFactorSecret) {
            return NextResponse.json(
                { error: "2FA is not currently enabled." },
                { status: 400 }
            );
        }

        // ── Verify the TOTP token before allowing disable ────────────────
        const isValid = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: "base32",
            token,
        });

        if (!isValid) {
            return NextResponse.json(
                { error: "Invalid authenticator code." },
                { status: 400 }
            );
        }

        // ── Disable 2FA and clear the secret ─────────────────────────────
        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorEnabled: false, twoFactorSecret: null },
        });

        // ISO 27001: Audit 2FA disablement
        void audit({
            userId,
            action: "TFA_DISABLED",
            resourceType: "UserAccount",
            resourceId: userId,
            req,
        });

        return NextResponse.json({
            success: true,
            message: "Two-factor authentication has been disabled.",
        });
    } catch (error) {
        console.error("2FA disable error:", error);
        return NextResponse.json(
            { error: "Failed to disable 2FA" },
            { status: 500 }
        );
    }
}
