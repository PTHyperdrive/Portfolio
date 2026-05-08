/**
 * Shkeeper.io — Self-Hosted Crypto Payment Gateway Client
 *
 * Communicates with a self-hosted Shkeeper instance to process USDT payments.
 * Uses HD wallet derivation (xpub/ypub/zpub) for unique, non-reusable deposit
 * addresses per top-up request to maximize tracking resistance.
 *
 * Supports USDT on both TRC-20 and ERC-20 networks.
 *
 * Environment variables required:
 *   SHKEEPER_BASE_URL       — Base URL of your Shkeeper instance
 *   SHKEEPER_API_KEY        — API key for authentication
 *   SHKEEPER_WEBHOOK_SECRET — HMAC secret for webhook signature validation
 */

import { createHmac } from "crypto";

// ── Types ────────────────────────────────────────────────────────────────────

export type CryptoChain = "TRC20" | "ERC20";

export interface SHKInvoiceRequest {
    /** Amount in USDT */
    amount: number;
    /** Unique callback ID (our CryptoTopup.id) */
    callbackUrl: string;
    /** Crypto to receive */
    crypto: string;
}

export interface SHKInvoiceResponse {
    /** The unique deposit address for this payment */
    addr: string;
    /** Amount expected */
    amount: string;
    /** HD wallet derivation index used */
    dest_tag?: number;
}

export interface SHKWebhookPayload {
    /** Transaction hash */
    txid: string;
    /** Deposit address */
    addr: string;
    /** Amount received (string) */
    amount: string;
    /** Number of confirmations */
    confirmations: number;
    /** Crypto identifier */
    crypto: string;
    /** External ID (our topup ID) */
    external_id?: string;
    /** Status from Shkeeper */
    status: string;
}

// ── Configuration ────────────────────────────────────────────────────────────

function getConfig() {
    const baseUrl = process.env.SHKEEPER_BASE_URL;
    const apiKey = process.env.SHKEEPER_API_KEY;
    const webhookSecret = process.env.SHKEEPER_WEBHOOK_SECRET;

    if (!baseUrl || !apiKey) {
        throw new Error(
            "[shkeeper] Missing SHKEEPER_BASE_URL or SHKEEPER_API_KEY environment variables"
        );
    }

    return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, webhookSecret: webhookSecret ?? "" };
}

/**
 * Map our chain enum to Shkeeper's crypto identifier.
 * Shkeeper uses strings like "USDT-TRC20", "USDT-ERC20".
 */
function chainToCrypto(chain: CryptoChain): string {
    return chain === "TRC20" ? "USDT-TRC20" : "USDT-ERC20";
}

// ── API Client ───────────────────────────────────────────────────────────────

/**
 * Create a payment invoice on Shkeeper.
 * Returns a unique HD-derived deposit address for the user.
 *
 * @param topupId   — Our CryptoTopup record ID (used as external_id for webhook correlation)
 * @param amount    — Amount in USDT
 * @param chain     — TRC20 or ERC20
 */
export async function createPaymentInvoice(
    topupId: string,
    amount: number,
    chain: CryptoChain
): Promise<{ depositAddress: string; derivationIndex: number }> {
    const { baseUrl, apiKey } = getConfig();
    const crypto = chainToCrypto(chain);

    const webhookUrl = `${process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_URL ?? ""}/api/payment/crypto/webhook`;

    const response = await fetch(`${baseUrl}/api/v1/crypto/${crypto}/payment_request`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Shkeeper-API-Key": apiKey,
        },
        body: JSON.stringify({
            external_id: topupId,
            fiat_currency: "USD",
            amount: amount.toFixed(6),
            callback_url: webhookUrl,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`[shkeeper] Payment request failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as SHKInvoiceResponse;

    return {
        depositAddress: data.addr,
        derivationIndex: data.dest_tag ?? 0,
    };
}

/**
 * Query the status of a payment on Shkeeper.
 */
export async function getPaymentStatus(
    address: string,
    chain: CryptoChain
): Promise<{ confirmations: number; txHash: string | null; status: string }> {
    const { baseUrl, apiKey } = getConfig();
    const crypto = chainToCrypto(chain);

    const response = await fetch(
        `${baseUrl}/api/v1/crypto/${crypto}/payment_status/${encodeURIComponent(address)}`,
        {
            headers: { "X-Shkeeper-API-Key": apiKey },
        }
    );

    if (!response.ok) {
        return { confirmations: 0, txHash: null, status: "unknown" };
    }

    const data = await response.json();
    return {
        confirmations: data.confirmations ?? 0,
        txHash: data.txid ?? null,
        status: data.status ?? "pending",
    };
}

// ── Webhook Signature Verification ───────────────────────────────────────────

/**
 * Verify the HMAC signature of a Shkeeper webhook callback.
 *
 * Shkeeper signs the raw request body with the webhook secret using HMAC-SHA256
 * and sends it in the X-Shkeeper-HMAC header.
 *
 * @param rawBody       — The raw request body as a string
 * @param signatureHeader — The value of the X-Shkeeper-HMAC header
 * @returns true if the signature is valid
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    const { webhookSecret } = getConfig();
    if (!webhookSecret) {
        console.warn("[shkeeper] SHKEEPER_WEBHOOK_SECRET is not set — skipping signature validation");
        return true; // Allow in development; production MUST set the secret
    }

    const expectedSig = createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

    // Constant-time comparison
    if (expectedSig.length !== signatureHeader.length) return false;
    let result = 0;
    for (let i = 0; i < expectedSig.length; i++) {
        result |= expectedSig.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
    }
    return result === 0;
}
