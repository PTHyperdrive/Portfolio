import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { authenticator } from "otplib";
import { toDataURL } from "qrcode";

/**
 * GET /api/auth/2fa/generate
 *
 * Generates a new TOTP secret and QR code for the authenticated user.
 * Saves the secret to the database (twoFactorSecret) but does NOT
 * enable 2FA yet — that happens in the /verify endpoint once the user
 * proves they have the correct authenticator app configured.
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

        if (user.twoFactorEnabled) {
            return NextResponse.json(
                { error: "Two-factor authentication is already enabled" },
                { status: 400 }
            );
        }

        // ── 1. Generate a new TOTP secret ────────────────────────────────
        const secret = authenticator.generateSecret();

        // ── 2. Build the otpauth:// URI ──────────────────────────────────
        const otpauth = authenticator.keyuri(user.email, "NRSP Cloud", secret);

        // ── 3. Generate a QR code Data URL ───────────────────────────────
        const qrCodeUrl = await toDataURL(otpauth, {
            width: 256,
            margin: 2,
            color: { dark: "#ffffffee", light: "#00000000" },
        });

        // ── 4. Persist the secret (keep 2FA disabled until verified) ─────
        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorSecret: secret },
        });

        return NextResponse.json({ secret, qrCodeUrl });
    } catch (error) {
        console.error("2FA generate error:", error);
        return NextResponse.json(
            { error: "Failed to generate 2FA credentials" },
            { status: 500 }
        );
    }
}
