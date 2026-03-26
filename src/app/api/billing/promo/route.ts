import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logUserActivity } from "@/lib/logger";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const { code } = body as { code?: string };

        if (!code || typeof code !== "string") {
            return NextResponse.json({ error: "Promo code is required" }, { status: 400 });
        }

        const userId    = session.user.id;
        const upperCode = code.trim().toUpperCase();

        // ── 1. Lookup ─────────────────────────────────────────────────
        const promo = await prisma.promoCode.findUnique({
            where: { code: upperCode },
        });

        if (!promo) {
            return NextResponse.json({ error: "Invalid promo code" }, { status: 400 });
        }

        // ── 2. Expiration ─────────────────────────────────────────────
        if (promo.expiresAt && new Date() > promo.expiresAt) {
            return NextResponse.json({ error: "Promo code expired" }, { status: 400 });
        }

        // ── 3. Usage limit ────────────────────────────────────────────
        if (promo.currentUses >= promo.maxUses) {
            return NextResponse.json({ error: "Promo code limit reached" }, { status: 400 });
        }

        // ── 4. Double-redemption check ────────────────────────────────
        const alreadyUsed = await prisma.appliedPromoCode.findUnique({
            where: { userId_promoCodeId: { userId, promoCodeId: promo.id } },
        });

        if (alreadyUsed) {
            return NextResponse.json({ error: "You have already used this promo code" }, { status: 400 });
        }

        // ── 5. Atomic transaction ─────────────────────────────────────
        await prisma.$transaction([
            // a) Increment usage counter on the code
            prisma.promoCode.update({
                where: { id: promo.id },
                data:  { currentUses: { increment: 1 } },
            }),
            // b) Record which user redeemed this code
            prisma.appliedPromoCode.create({
                data: { userId, promoCodeId: promo.id },
            }),
            // c) Add credits to the user wallet
            prisma.user.update({
                where: { id: userId },
                data:  { credits: { increment: promo.creditValue } },
            }),
            // d) Write a CreditTransaction record for auditing
            prisma.creditTransaction.create({
                data: {
                    userId,
                    type:    "PROMO_REDEEM",
                    amount:  promo.creditValue,
                    details: `Redeemed code: ${upperCode}`,
                },
            }),
        ]);

        // ── 6. Fetch new balance to return to the frontend ────────────
        const updatedUser = await prisma.user.findUnique({
            where:  { id: userId },
            select: { credits: true },
        });

        const newBalance = Number(updatedUser?.credits ?? 0);

        // ── 7. Fire-and-forget activity log ───────────────────────────
        void logUserActivity({
            userId,
            action:  "Promo Code Redeemed",
            service: "Billing",
            status:  "Success",
            req,
            details: { code: upperCode, creditsAdded: promo.creditValue, newBalance },
        });

        return NextResponse.json({
            success:      true,
            creditsAdded: promo.creditValue,
            newBalance,
            message:      `${promo.creditValue.toLocaleString()} credits added to your wallet!`,
        });

    } catch (err) {
        console.error("[promo] POST error:", err);
        return NextResponse.json({ error: "Failed to apply promo code" }, { status: 500 });
    }
}
