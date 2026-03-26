import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { code } = await req.json();
        if (!code || typeof code !== "string") {
            return NextResponse.json({ error: "Promo code is required" }, { status: 400 });
        }

        const userId = session.user.id;
        const upperCode = code.trim().toUpperCase();

        // 1. Find the promo code
        const promo = await prisma.promoCode.findUnique({
            where: { code: upperCode },
        });

        if (!promo) {
            return NextResponse.json({ error: "Invalid promo code" }, { status: 404 });
        }

        // 2. Check expiry
        if (promo.expiresAt && new Date() > promo.expiresAt) {
            return NextResponse.json({ error: "This promo code has expired" }, { status: 410 });
        }

        // 3. Check max global uses
        if (promo.currentUses >= promo.maxUses) {
            return NextResponse.json({ error: "This promo code has reached its usage limit" }, { status: 409 });
        }

        // 4. Check if user has already used this code
        const alreadyUsed = await prisma.appliedPromoCode.findUnique({
            where: { userId_promoCodeId: { userId, promoCodeId: promo.id } },
        });

        if (alreadyUsed) {
            return NextResponse.json({ error: "You have already used this promo code" }, { status: 409 });
        }

        // 5. Atomically: add credits, mark code used, log transaction
        await prisma.$transaction([
            prisma.user.update({
                where: { id: userId },
                data: { credits: { increment: promo.creditValue } },
            }),
            prisma.promoCode.update({
                where: { id: promo.id },
                data: { currentUses: { increment: 1 } },
            }),
            prisma.appliedPromoCode.create({
                data: { userId, promoCodeId: promo.id },
            }),
            prisma.creditTransaction.create({
                data: {
                    userId,
                    type: "Promo_Redeem",
                    amount: promo.creditValue,
                    details: `Promo: ${upperCode}`,
                },
            }),
        ]);

        return NextResponse.json({
            success: true,
            creditsAdded: promo.creditValue,
            message: `${promo.creditValue.toLocaleString()} credits added!`,
        });
    } catch (err) {
        console.error("[promo] POST error:", err);
        return NextResponse.json({ error: "Failed to apply promo code" }, { status: 500 });
    }
}
