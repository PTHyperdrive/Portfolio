import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import speakeasy from "speakeasy";
import QRCode from "qrcode";

/**
 * GET /api/auth/2fa/generate
 *
 * Generates a new TOTP secret and QR code for the authenticated user.
 * Saves the base32 secret to the database but does NOT enable 2FA yet —
 * that only happens in /verify once the user proves they can generate
 * a valid token with their authenticator app.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, twoFactorEnabled: true },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // ── 1. Generate a new TOTP secret ────────────────────────────────
        // Generating always resets twoFactorEnabled so the user must re-verify
        // with the new code. This also serves as a re-setup path (lost device, etc.)
        const secret = speakeasy.generateSecret({
            name: `NRSP Cloud (${user.email})`,
        });

        // ── 2. Extract the base32 key (persisted in DB) ──────────────────
        const manualKey = secret.base32;

        // ── 3. Generate QR Code data URI ─────────────────────────────────
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url as string);

        // ── 4. Save the new secret and reset the enabled flag ─────────────
        // twoFactorEnabled stays/becomes false until the user verifies below
        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorSecret: manualKey, twoFactorEnabled: false },
        });

        return NextResponse.json({ secret: manualKey, qrCodeUrl });
    } catch (error) {
        console.error("2FA generate error:", error);
        return NextResponse.json(
            { error: "Failed to generate 2FA credentials" },
            { status: 500 }
        );
    }
}
