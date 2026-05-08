import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/security";
import { headers } from "next/headers";

/**
 * POST /api/invitations/validate — Public code validation (does NOT consume)
 * Body: { code: string }
 * Rate limited: 10 attempts/min per IP
 */
export async function POST(req: NextRequest) {
    try {
        const headersList = await headers();
        const ip = headersList.get("x-forwarded-for") || "unknown";
        const rl = checkRateLimit(`invite-validate:${ip}`, 10, 60_000);
        if (!rl.allowed) {
            return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
        }

        const { code } = await req.json();
        if (!code || typeof code !== "string") {
            return NextResponse.json({ valid: false, error: "Code is required" }, { status: 400 });
        }

        const invitation = await prisma.invitationCode.findUnique({
            where: { code: code.toUpperCase().trim() },
            select: { active: true, maxUses: true, usedCount: true, expiresAt: true },
        });

        if (!invitation) {
            return NextResponse.json({ valid: false, error: "Code not found" });
        }

        if (!invitation.active) {
            return NextResponse.json({ valid: false, error: "Code is deactivated" });
        }

        if (invitation.expiresAt && new Date() > invitation.expiresAt) {
            return NextResponse.json({ valid: false, expired: true, error: "Code has expired" });
        }

        if (invitation.usedCount >= invitation.maxUses) {
            return NextResponse.json({ valid: false, error: "Code has reached maximum uses" });
        }

        return NextResponse.json({
            valid: true,
            remainingUses: invitation.maxUses - invitation.usedCount,
        });
    } catch (error) {
        console.error("[invitations/validate] error:", error);
        return NextResponse.json({ valid: false, error: "Validation failed" }, { status: 500 });
    }
}
