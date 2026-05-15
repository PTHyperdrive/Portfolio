import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import speakeasy from "speakeasy";
import { safeDecryptTotpSecret } from "@/lib/totp-crypto";

/**
 * require2fa — Server-side 2FA enforcement helper
 *
 * Call this in API routes before critical actions.
 * If the user has 2FA enabled, a valid TOTP token is required.
 * If 2FA is not enabled, this passes through silently.
 *
 * Usage:
 *   const check = await require2fa(userId, body.totpToken);
 *   if (!check.ok) return NextResponse.json({ error: check.error }, { status: 403 });
 */
export async function require2fa(
    userId: string,
    totpToken?: string | null,
): Promise<{ ok: boolean; error?: string }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true, twoFactorSecret: true },
    });

    if (!user) {
        return { ok: false, error: "USER_NOT_FOUND" };
    }

    // 2FA not enabled — no enforcement
    if (!user.twoFactorEnabled) {
        return { ok: true };
    }

    // 2FA enabled but no token provided
    if (!totpToken) {
        return { ok: false, error: "2FA_REQUIRED" };
    }

    // 2FA enabled but no secret stored (broken state)
    if (!user.twoFactorSecret) {
        return { ok: false, error: "2FA_NOT_CONFIGURED" };
    }

    // Decrypt the stored secret before verifying
    const decryptedSecret = safeDecryptTotpSecret(user.twoFactorSecret);

    // Verify the TOTP token
    const isValid = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: "base32",
        token: totpToken.trim(),
    });

    if (!isValid) {
        return { ok: false, error: "INVALID_2FA" };
    }

    return { ok: true };
}

/**
 * Helper to create a 403 NextResponse for 2FA failures.
 */
export function twoFactorErrorResponse(error: string) {
    const messages: Record<string, string> = {
        "2FA_REQUIRED": "Two-factor authentication code required for this action.",
        "INVALID_2FA": "Invalid authenticator code. Please try again.",
        "2FA_NOT_CONFIGURED": "2FA is enabled but not properly configured.",
        "USER_NOT_FOUND": "User not found.",
    };

    return NextResponse.json(
        { error, message: messages[error] || "2FA verification failed." },
        { status: 403 },
    );
}
