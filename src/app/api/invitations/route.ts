import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import crypto from "crypto";

/**
 * Generate a random invitation code in format: NRSP-XXXX-XXXX
 */
function generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0/O/1/I to avoid confusion
    const seg = (len: number) =>
        Array.from(crypto.randomBytes(len))
            .map(b => chars[b % chars.length])
            .join("");
    return `NRSP-${seg(4)}-${seg(4)}`;
}

/**
 * GET /api/invitations — List the authenticated user's own invitation codes
 * Only accessible if user.canInvite === true
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { canInvite: true },
        });

        if (!user?.canInvite) {
            return NextResponse.json({ error: "Invitation privileges not enabled" }, { status: 403 });
        }

        const codes = await prisma.invitationCode.findMany({
            where: { creatorId: session.user.id },
            include: {
                redemptions: {
                    select: {
                        id: true,
                        userId: true,
                        redeemedAt: true,
                        context: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ codes });
    } catch (error) {
        console.error("[invitations] GET error:", error);
        return NextResponse.json({ error: "Failed to load codes" }, { status: 500 });
    }
}

/**
 * POST /api/invitations — Generate a new invitation code
 * Only accessible if user.canInvite === true
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { canInvite: true },
        });

        if (!user?.canInvite) {
            return NextResponse.json({ error: "Invitation privileges not enabled" }, { status: 403 });
        }

        // Generate a unique code (retry if collision)
        let code: string;
        let attempts = 0;
        do {
            code = generateCode();
            const existing = await prisma.invitationCode.findUnique({ where: { code } });
            if (!existing) break;
            attempts++;
        } while (attempts < 5);

        if (attempts >= 5) {
            return NextResponse.json({ error: "Failed to generate unique code" }, { status: 500 });
        }

        const invitation = await prisma.invitationCode.create({
            data: {
                code,
                creatorId: session.user.id,
                maxUses: 10,
            },
        });

        void audit({
            userId: session.user.id,
            action: "INVITE_CODE_GENERATED",
            resourceType: "InvitationCode",
            resourceId: invitation.id,
            metadata: { code },
            req,
        });

        return NextResponse.json({ code: invitation.code, id: invitation.id }, { status: 201 });
    } catch (error) {
        console.error("[invitations] POST error:", error);
        return NextResponse.json({ error: "Failed to generate code" }, { status: 500 });
    }
}
