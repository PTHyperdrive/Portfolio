import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createPaymentInvoice, type CryptoChain } from "@/lib/shkeeper";
import { calculateCreditsFromUsdt } from "@/lib/pricing-config";

/**
 * POST /api/payment/crypto/topup
 * Initiate a new USDT crypto top-up.
 * Generates a unique HD-derived deposit address via Shkeeper.
 *
 * Body: { amountUsdt: number, chain: "TRC20" | "ERC20" }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { amountUsdt, chain } = (await req.json()) as {
            amountUsdt: number;
            chain: CryptoChain;
        };

        // Validation
        if (!amountUsdt || amountUsdt <= 0) {
            return NextResponse.json(
                { error: "amountUsdt must be a positive number" },
                { status: 400 }
            );
        }

        if (chain !== "TRC20" && chain !== "ERC20") {
            return NextResponse.json(
                { error: "chain must be TRC20 or ERC20" },
                { status: 400 }
            );
        }

        // Calculate credit amount at current exchange rate
        const creditAmount = await calculateCreditsFromUsdt(amountUsdt);

        // Create the CryptoTopup record first (needed for external_id)
        const topup = await prisma.cryptoTopup.create({
            data: {
                userId: session.user.id,
                amountUsdt,
                creditAmount,
                chain,
                depositAddress: "pending", // Placeholder until Shkeeper responds
                derivationIndex: 0,
                status: "PENDING",
                expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
            },
        });

        // Request a unique deposit address from Shkeeper
        const { depositAddress, derivationIndex } = await createPaymentInvoice(
            topup.id,
            amountUsdt,
            chain
        );

        // Update the record with the real deposit address
        const updated = await prisma.cryptoTopup.update({
            where: { id: topup.id },
            data: { depositAddress, derivationIndex },
        });

        // Audit
        void audit({
            userId: session.user.id,
            action: "CRYPTO_TOPUP_INITIATED",
            resourceType: "Billing",
            resourceId: topup.id,
            metadata: {
                amountUsdt,
                chain,
                creditAmount,
                depositAddress,
            },
            req,
        });

        return NextResponse.json({
            topupId: updated.id,
            depositAddress: updated.depositAddress,
            amountUsdt,
            creditAmount,
            chain,
            expiresAt: updated.expiresAt.toISOString(),
        });
    } catch (error) {
        console.error("[crypto/topup] POST error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create top-up" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/payment/crypto/topup?topupId=...
 * Poll the status of an existing crypto top-up.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const topupId = req.nextUrl.searchParams.get("topupId");
        if (!topupId) {
            return NextResponse.json({ error: "topupId is required" }, { status: 400 });
        }

        const topup = await prisma.cryptoTopup.findFirst({
            where: {
                id: topupId,
                userId: session.user.id,
            },
            select: {
                id: true,
                amountUsdt: true,
                creditAmount: true,
                chain: true,
                depositAddress: true,
                status: true,
                confirmations: true,
                txHash: true,
                expiresAt: true,
                completedAt: true,
                createdAt: true,
            },
        });

        if (!topup) {
            return NextResponse.json({ error: "Top-up not found" }, { status: 404 });
        }

        // Check expiry for PENDING top-ups
        if (topup.status === "PENDING" && new Date() > topup.expiresAt) {
            await prisma.cryptoTopup.update({
                where: { id: topup.id },
                data: { status: "EXPIRED" },
            });
            return NextResponse.json({ ...topup, status: "EXPIRED" });
        }

        return NextResponse.json(topup);
    } catch (error) {
        console.error("[crypto/topup] GET error:", error);
        return NextResponse.json(
            { error: "Failed to fetch top-up status" },
            { status: 500 }
        );
    }
}
