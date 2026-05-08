import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * POST /api/invitations/redeem — Redeem an invitation code at checkout
 * Body: { code: string }
 * Authenticated only. Atomically increments usedCount and creates redemption record.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { code } = await req.json();
        if (!code || typeof code !== "string") {
            return NextResponse.json({ error: "Code is required" }, { status: 400 });
        }

        const normalised = code.toUpperCase().trim();

        const invitation = await prisma.invitationCode.findUnique({
            where: { code: normalised },
            select: { id: true, active: true, maxUses: true, usedCount: true, expiresAt: true, creatorId: true },
        });

        if (!invitation) {
            return NextResponse.json({ error: "Invalid invitation code" }, { status: 400 });
        }
        if (!invitation.active) {
            return NextResponse.json({ error: "Code is deactivated" }, { status: 400 });
        }
        if (invitation.expiresAt && new Date() > invitation.expiresAt) {
            return NextResponse.json({ error: "Code has expired" }, { status: 400 });
        }
        if (invitation.usedCount >= invitation.maxUses) {
            return NextResponse.json({ error: "Code has reached maximum uses" }, { status: 400 });
        }

        // Check user hasn't already redeemed this code
        const existing = await prisma.invitationRedemption.findUnique({
            where: {
                invitationCodeId_userId: {
                    invitationCodeId: invitation.id,
                    userId: session.user.id,
                },
            },
        });

        if (existing) {
            return NextResponse.json({ error: "You have already redeemed this code" }, { status: 409 });
        }

        // Atomic: increment usedCount + create redemption
        await prisma.$transaction([
            prisma.invitationCode.update({
                where: { id: invitation.id },
                data: { usedCount: { increment: 1 } },
            }),
            prisma.invitationRedemption.create({
                data: {
                    invitationCodeId: invitation.id,
                    userId: session.user.id,
                    context: "CHECKOUT",
                },
            }),
        ]);

        void audit({
            userId: session.user.id,
            action: "INVITE_CODE_REDEEMED",
            resourceType: "InvitationCode",
            resourceId: invitation.id,
            metadata: {
                code: normalised,
                redeemedBy: session.user.id,
                invitedBy: invitation.creatorId,
                context: "CHECKOUT",
            },
            req,
        });

        return NextResponse.json({ success: true, code: normalised });
    } catch (error) {
        console.error("[invitations/redeem] error:", error);
        return NextResponse.json({ error: "Redemption failed" }, { status: 500 });
    }
}
