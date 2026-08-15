/**
 * AI node credential encryption
 *
 * Split out from ai-nodes so that both the node registry and the provider
 * adapters can decrypt a key without importing each other. ai-nodes needs the
 * adapter registry (to report a node's capabilities to the browser) and the
 * adapters need the key — putting the crypto here is what keeps that from
 * being an import cycle.
 *
 * AES-256-GCM under AI_NODE_ENCRYPTION_KEY, falling back to
 * TOTP_ENCRYPTION_KEY so an existing deployment does not need a second secret
 * before it can register a hosted provider.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Message surfaced to an admin who tries to store a key with no cipher key set. */
export const NO_ENCRYPTION_KEY =
    "AI_NODE_ENCRYPTION_KEY is not configured, so an upstream API key cannot be stored " +
    "safely. Generate one with `openssl rand -hex 32`, or leave the API key blank — " +
    "LM Studio does not require one by default.";

/** True when node API keys can be encrypted at rest. */
export function nodeKeyEncryptionAvailable(): boolean {
    const hex = process.env.AI_NODE_ENCRYPTION_KEY || process.env.TOTP_ENCRYPTION_KEY;
    return Boolean(hex && hex.length === 64);
}

function getKey(): Buffer {
    const hex = process.env.AI_NODE_ENCRYPTION_KEY || process.env.TOTP_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error(NO_ENCRYPTION_KEY);
    }
    return Buffer.from(hex, "hex");
}

/** Encrypt an upstream API key. Returns "hex(iv):hex(ciphertext+tag)". */
export function encryptNodeKey(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return `${iv.toString("hex")}:${Buffer.concat([ct, cipher.getAuthTag()]).toString("hex")}`;
}

/** Decrypt an upstream API key. Returns null rather than throwing — a bad
 *  key must degrade to "no auth header", not crash the chat request. */
export function decryptNodeKey(encrypted: string | null): string | null {
    if (!encrypted) return null;
    try {
        const idx = encrypted.indexOf(":");
        if (idx === -1) return null;
        const iv = Buffer.from(encrypted.slice(0, idx), "hex");
        const blob = Buffer.from(encrypted.slice(idx + 1), "hex");
        if (iv.length !== IV_LENGTH) return null;

        const ct = blob.subarray(0, blob.length - AUTH_TAG_LENGTH);
        const tag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
        const decipher = createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    } catch {
        console.error("[ai-nodes] Failed to decrypt node API key — sending request unauthenticated.");
        return null;
    }
}
