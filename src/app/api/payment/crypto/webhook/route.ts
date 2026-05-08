import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { verifyWebhookSignature, type SHKWebhookPayload } from "@/lib/shkeeper";
import { getRequiredConfirmations } from "@/lib/pricing-config";

/**
 * POST /api/payment/crypto/webhook
 *
 * Shkeeper transaction confirmation webhook receiver.
 *
 * Flow:
 *  1. Validate HMAC signature (X-Shkeeper-HMAC header)
 *  2. Parse payload — match by deposit address or external_id
 *  3. Update confirmations on the CryptoTopup record
 *  4. On sufficient confirmations:  atomically mint credits + mark COMPLETED
 *  5. Respond 200 OK to prevent Shkeeper retries
 *
 * Idempotent: already-completed top-ups are silently acknowledged.
 */
export async function POST(req: NextRequest) {
    try {
        // Read raw body for HMAC verification
        const rawBody = await req.text();
        const hmacHeader = req.headers.get("X-Shkeeper-HMAC") ?? "";

        // Verify webhook signature
        if (!verifyWebhookSignature(rawBody, hmacHeader)) {
            console.warn("[webhook] Invalid HMAC signature — rejecting");
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }

        const payload: SHKWebhookPayload = JSON.parse(rawBody);
        const { addr, txid, amount, confirmations, external_id, status } = payload;

        // Find the CryptoTopup record by deposit address or external_id
        const topup = await prisma.cryptoTopup.findFirst({
            where: external_id
                ? { id: external_id }
                : { depositAddress: addr },
        });

        if (!topup) {
            // Unknown address — acknowledge to prevent retries
            console.warn(`[webhook] Unknown deposit address or ID: ${addr} / ${external_id}`);
            return NextResponse.json({ status: "unknown_address" });
        }

        // Already completed — idempotent acknowledgement
        if (topup.status === "COMPLETED") {
            return NextResponse.json({ status: "already_completed" });
        }

        // Determine chain and required confirmations
        const chain = topup.chain as "TRC20" | "ERC20";
        const requiredConfirmations = await getRequiredConfirmations();
        const required = requiredConfirmations[chain] ?? 1;

        // Update confirmation count and tx hash
        const updateData: Record<string, unknown> = {
            confirmations,
            txHash: txid || topup.txHash,
        };

        if (confirmations > 0 && topup.status === "PENDING") {
            updateData.status = "CONFIRMING";
        }

        // Check if we have enough confirmations to complete
        if (confirmations >= required) {
            // Atomic transaction: complete topup + mint credits + log credit transaction
            await prisma.$transaction([
                prisma.cryptoTopup.update({
                    where: { id: topup.id },
                    data: {
                        ...updateData,
                        status: "COMPLETED",
                        completedAt: new Date(),
                    },
                }),
                prisma.user.update({
                    where: { id: topup.userId },
                    data: {
                        credits: { increment: topup.creditAmount },
                    },
                }),
                prisma.creditTransaction.create({
                    data: {
                        userId: topup.userId,
                        type: "Crypto_Topup",
                        amount: topup.creditAmount,
                        details: `USDT ${chain} top-up: ${topup.amountUsdt} USDT -> ${topup.creditAmount.toLocaleString()} credits (tx: ${txid || "N/A"})`,
                    },
                }),
            ]);

            // Audit the completed top-up
            void audit({
                userId: topup.userId,
                action: "CRYPTO_TOPUP_COMPLETED",
                resourceType: "Billing",
                resourceId: topup.id,
                metadata: {
                    amountUsdt: topup.amountUsdt.toString(),
                    creditsMinted: topup.creditAmount,
                    chain,
                    txHash: txid,
                    confirmations,
                    shkeeperStatus: status,
                },
            });

            return NextResponse.json({ status: "completed", creditsMinted: topup.creditAmount });
        }

        // Not enough confirmations yet — just update the record
        await prisma.cryptoTopup.update({
            where: { id: topup.id },
            data: updateData,
        });

        return NextResponse.json({
            status: "confirming",
            confirmations,
            required,
        });
    } catch (error) {
        console.error("[webhook] Processing error:", error);
        // Return 200 even on error to prevent Shkeeper from hammering retries
        // Real errors are logged and can be investigated via server logs
        return NextResponse.json({ status: "error", message: "Internal processing error" });
    }
}
