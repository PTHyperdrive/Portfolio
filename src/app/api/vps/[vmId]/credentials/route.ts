import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { safeDecryptTotpSecret as decryptSecret } from "@/lib/totp-crypto";
import { require2fa, twoFactorErrorResponse } from "@/lib/require2fa";

/**
 * POST /api/vps/[vmId]/credentials
 *
 * Returns the cloud-init login credentials for a VM the caller owns. The
 * password is stored AES-256-GCM encrypted and decrypted here on demand — it is
 * never included in the regular VM polling payload. Access is audited.
 *
 * If the user has 2FA enabled, a valid TOTP token must be provided in the
 * request body. Users without 2FA configured can access credentials directly.
 *
 * VMs created before credential storage (or via the admin/ISO path) have no
 * stored credentials; the endpoint reports hasCredentials:false in that case.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> },
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { vmId } = await params;

        // Parse optional TOTP token from body
        let totpToken: string | undefined;
        try {
            const body = await req.json() as { totpToken?: string };
            totpToken = body.totpToken;
        } catch {
            // Empty body is fine — means no TOTP token provided
        }

        // Enforce 2FA if user has it enabled
        const twoFaCheck = await require2fa(session.user.id, totpToken);
        if (!twoFaCheck.ok) {
            return twoFactorErrorResponse(twoFaCheck.error!);
        }

        const instance = await prisma.vpsInstance.findFirst({
            where: { vmId, userId: session.user.id },
            select: { id: true, ciUsername: true, ciPassword: true },
        });
        if (!instance) {
            return NextResponse.json({ error: "VM not found" }, { status: 404 });
        }

        if (!instance.ciUsername && !instance.ciPassword) {
            return NextResponse.json({ hasCredentials: false });
        }

        let password: string | null = null;
        if (instance.ciPassword) {
            try { password = decryptSecret(instance.ciPassword); }
            catch { password = null; }
        }

        void audit({
            userId: session.user.id,
            action: "CONSOLE_VNC_ACCESS", // closest existing access action
            resourceType: "VirtualMachine",
            resourceId: vmId,
            metadata: { event: "credentials_revealed" },
            req,
        });

        return NextResponse.json({
            hasCredentials: true,
            username: instance.ciUsername ?? null,
            password,
        });
    } catch (err) {
        console.error("[vps credentials] error:", err);
        return NextResponse.json({ error: "Failed to load credentials" }, { status: 500 });
    }
}
