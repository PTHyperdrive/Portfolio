import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

/**
 * Support-chat consent.
 *
 * The support bubble is opt-in: no SUPPORT conversation can be created until
 * the user has accepted here (enforced in /api/ai/conversations, not just in
 * the widget). Consent is a one-time, account-level timestamp.
 */

/** GET /api/ai/support/consent — has this user opted in? */
export async function GET() {
    const { userId, error } = await requireUser();
    if (error) return error;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { supportChatConsentAt: true },
    });

    return NextResponse.json({ consentedAt: user?.supportChatConsentAt ?? null });
}

/** POST /api/ai/support/consent — record the opt-in. Idempotent. */
export async function POST(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { supportChatConsentAt: true },
    });

    if (user?.supportChatConsentAt) {
        return NextResponse.json({ consentedAt: user.supportChatConsentAt });
    }

    const updated = await prisma.user.update({
        where: { id: userId },
        data: { supportChatConsentAt: new Date() },
        select: { supportChatConsentAt: true },
    });

    void audit({
        userId,
        action: "SUPPORT_CHAT_CONSENT",
        resourceType: "User",
        resourceId: userId,
        req,
    });

    return NextResponse.json({ consentedAt: updated.supportChatConsentAt });
}
