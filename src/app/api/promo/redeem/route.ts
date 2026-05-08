import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * POST /api/promo/redeem — Redeem a promo code for credits
 * Body: { code: string }
 * Authenticated only. Adds credits to user wallet and audits as PROMO_APPLIED.
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

        const promo = await prisma.promoCode.findUnique({
            where: { code: normalised },
        });

        if (!promo) {
            return NextResponse.json({ error: "Invalid promo code" }, { status: 400 });
        }

        if (promo.expiresAt && new Date() > promo.expiresAt) {
            return NextResponse.json({ error: "Promo code has expired" }, { status: 400 });
        }

        if (promo.currentUses >= promo.maxUses) {
            return NextResponse.json({ error: "Promo code has reached maximum uses" }, { status: 400 });
        }

        // Check user hasn't already redeemed
        const alreadyApplied = await prisma.appliedPromoCode.findUnique({
            where: {
                userId_promoCodeId: {
                    userId: session.user.id,
                    promoCodeId: promo.id,
                },
            },
        });

        if (alreadyApplied) {
            return NextResponse.json({ error: "You have already redeemed this promo code" }, { status: 409 });
        }

        // Atomic: increment uses, create applied record, add credits, create credit transaction
        await prisma.$transaction([
            prisma.promoCode.update({
                where: { id: promo.id },
                data: { currentUses: { increment: 1 } },
            }),
            prisma.appliedPromoCode.create({
                data: {
                    userId: session.user.id,
                    promoCodeId: promo.id,
                },
            }),
            prisma.user.update({
                where: { id: session.user.id },
                data: { credits: { increment: promo.creditValue } },
            }),
            prisma.creditTransaction.create({
                data: {
                    userId: session.user.id,
                    type: "Promo_Redeem",
                    amount: promo.creditValue,
                    details: `Promo: ${normalised}`,
                },
            }),
        ]);

        void audit({
            userId: session.user.id,
            action: "PROMO_APPLIED",
            resourceType: "PromoCode",
            resourceId: promo.id,
            metadata: { code: normalised, creditValue: promo.creditValue },
            req,
        });

        return NextResponse.json({
            success: true,
            creditsAdded: promo.creditValue,
            code: normalised,
        });
    } catch (error) {
        console.error("[promo/redeem] error:", error);
        return NextResponse.json({ error: "Redemption failed" }, { status: 500 });
    }
}
