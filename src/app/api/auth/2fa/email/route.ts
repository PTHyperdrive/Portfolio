import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendEmailOtp, verifyEmailOtp } from "@/lib/email-otp";

/**
 * POST /api/auth/2fa/email — manage email-code 2FA (authenticated).
 *
 * Body: { action: "setup" | "verify" | "disable", code?: string }
 *   - setup   → emails a verification code to the user's address
 *   - verify  → confirms the code and enables email 2FA
 *   - disable → turns email 2FA off
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;

        const body = await req.json().catch(() => ({}));
        const action = body?.action;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, emailTwoFactorEnabled: true },
        });
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        if (action === "setup") {
            const r = await sendEmailOtp(userId, user.email, "setup");
            if (!r.ok) {
                const map: Record<string, [string, number]> = {
                    MAILER_NOT_CONFIGURED: ["Email delivery is not configured on the server.", 503],
                    TOO_SOON: ["Please wait a minute before requesting another code.", 429],
                    TOO_MANY: ["Too many codes requested. Try again later.", 429],
                };
                const [msg, status] = map[r.error ?? ""] ?? ["Failed to send code.", 500];
                return NextResponse.json({ error: msg }, { status });
            }
            return NextResponse.json({ ok: true, sentTo: user.email });
        }

        if (action === "verify") {
            const code = typeof body?.code === "string" ? body.code.trim() : "";
            const ok = await verifyEmailOtp(userId, "setup", code);
            if (!ok) {
                return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });
            }
            await prisma.user.update({ where: { id: userId }, data: { emailTwoFactorEnabled: true } });
            void audit({ userId, action: "TFA_ENABLED", resourceType: "UserAccount", resourceId: userId, metadata: { method: "email" }, req });
            return NextResponse.json({ ok: true, enabled: true });
        }

        if (action === "disable") {
            await prisma.user.update({ where: { id: userId }, data: { emailTwoFactorEnabled: false } });
            void audit({ userId, action: "TFA_DISABLED", resourceType: "UserAccount", resourceId: userId, metadata: { method: "email" }, req });
            return NextResponse.json({ ok: true, enabled: false });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error("[2fa/email] error:", error);
        return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
}
