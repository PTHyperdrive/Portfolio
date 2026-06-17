import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/security";
import { generateRecoveryCodes, getRecoveryStatus } from "@/lib/recovery-codes";
import { require2fa, twoFactorErrorResponse } from "@/lib/require2fa";

/**
 * Manage backup recovery codes for the signed-in user.
 *
 * GET  /api/auth/2fa/recovery        → current status (counts, attempts, lock)
 * POST /api/auth/2fa/recovery        → { action: "generate" }
 *   Mints a fresh set (replacing any old one) and returns the plaintext codes
 *   ONCE. Requires a primary 2FA method to be enabled — backup codes are a
 *   fallback for 2FA, not a standalone factor. Regenerating also re-arms the
 *   lifetime attempt cap.
 */

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const status = await getRecoveryStatus(session.user.id);
        return NextResponse.json({ ok: true, status });
    } catch (err) {
        console.error("[2fa/recovery] GET error:", err);
        return NextResponse.json({ error: "Failed to load recovery status" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;

        // Generating mints secrets — throttle to stop a hijacked session from
        // churning sets to brute-force or grief the owner.
        if (!checkRateLimit(`recovery-generate:${userId}`, 3, 60 * 60_000).allowed) {
            return NextResponse.json(
                { error: "Too many regenerations. Try again later." },
                { status: 429 },
            );
        }

        const body = await req.json().catch(() => ({}));
        if (body?.action !== "generate") {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        // Step-up: revealing a fresh set of backup codes is a critical action.
        // Require a TOTP token if the user has an authenticator enabled (no-op
        // for users without TOTP).
        const totpToken = typeof body?.totpToken === "string" ? body.totpToken : undefined;
        const stepUp = await require2fa(userId, totpToken);
        if (!stepUp.ok) return twoFactorErrorResponse(stepUp.error!);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { twoFactorEnabled: true, twoFactorSecret: true, emailTwoFactorEnabled: true },
        });
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const hasPrimary = (user.twoFactorEnabled && !!user.twoFactorSecret) || user.emailTwoFactorEnabled;
        if (!hasPrimary) {
            return NextResponse.json(
                { error: "Enable an authenticator app or email codes before creating backup codes." },
                { status: 400 },
            );
        }

        const codes = await generateRecoveryCodes(userId);

        void audit({
            userId,
            action: "TFA_RECOVERY_GENERATED",
            resourceType: "UserAccount",
            resourceId: userId,
            metadata: { count: codes.length },
            req,
        });

        // Returned exactly once — the server only keeps SHA-256 hashes.
        return NextResponse.json({ ok: true, codes });
    } catch (err) {
        console.error("[2fa/recovery] POST error:", err);
        return NextResponse.json({ error: "Failed to generate backup codes" }, { status: 500 });
    }
}
