/**
 * MMO Inventory Data Encryption — AES-256-GCM at Rest
 *
 * Encrypts pipe-delimited credential data (e.g. "email|password|recovery|2fa")
 * before storage in the database. Decrypts only upon confirmed purchase.
 *
 * Key management:
 *   - Key is sourced from `process.env.MMO_ENCRYPTION_KEY` (64 hex chars = 32 bytes)
 *   - Each item gets a unique 96-bit random IV (prepended to ciphertext)
 *   - AES-GCM provides both confidentiality and authentication (tamper detection)
 *
 * Storage format: hex(iv):hex(ciphertext+authTag)
 *   - iv = 12 bytes (24 hex chars)
 *   - ciphertext includes the 16-byte GCM auth tag appended by Node.js crypto
 *
 * If MMO_ENCRYPTION_KEY is not set, functions throw immediately — this is
 * intentional to prevent silent fallback to plaintext storage.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;       // 96-bit IV (NIST recommended for GCM)
const AUTH_TAG_LENGTH = 16;  // 128-bit authentication tag

/**
 * Get the encryption key from environment.
 * Throws if not configured — prevents accidental plaintext storage.
 */
function getEncryptionKey(): Buffer {
    const hex = process.env.MMO_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error(
            "[mmo-crypto] MMO_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
            "Generate one with: openssl rand -hex 32"
        );
    }
    return Buffer.from(hex, "hex");
}

/**
 * Encrypt plaintext inventory data with AES-256-GCM.
 *
 * @param plaintext — Raw pipe-delimited credential string
 * @returns Encrypted string in format "hex(iv):hex(ciphertext+tag)"
 */
export function encryptInventoryData(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Format: iv_hex:ciphertext_hex (auth tag appended to ciphertext)
    const ivHex = iv.toString("hex");
    const ctHex = Buffer.concat([encrypted, authTag]).toString("hex");

    return `${ivHex}:${ctHex}`;
}

/**
 * Decrypt AES-256-GCM encrypted inventory data.
 *
 * @param encrypted — String in format "hex(iv):hex(ciphertext+tag)"
 * @returns Decrypted plaintext string
 * @throws Error if data is tampered with, key is wrong, or format is invalid
 */
export function decryptInventoryData(encrypted: string): string {
    const key = getEncryptionKey();

    const colonIdx = encrypted.indexOf(":");
    if (colonIdx === -1) {
        throw new Error("[mmo-crypto] Invalid encrypted data format (missing IV separator)");
    }

    const ivHex = encrypted.slice(0, colonIdx);
    const ctWithTagHex = encrypted.slice(colonIdx + 1);

    const iv = Buffer.from(ivHex, "hex");
    const ctWithTag = Buffer.from(ctWithTagHex, "hex");

    if (iv.length !== IV_LENGTH) {
        throw new Error(`[mmo-crypto] Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
    }

    // Split ciphertext and auth tag
    const ct = ctWithTag.subarray(0, ctWithTag.length - AUTH_TAG_LENGTH);
    const authTag = ctWithTag.subarray(ctWithTag.length - AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(ct),
        decipher.final(),
    ]);

    return decrypted.toString("utf8");
}

/**
 * Check if a data string appears to be encrypted (has the iv:ct format).
 * Used for backward compatibility with pre-encryption inventory items.
 */
export function isEncrypted(data: string): boolean {
    const colonIdx = data.indexOf(":");
    if (colonIdx === -1) return false;
    // IV should be exactly 24 hex chars (12 bytes)
    const ivPart = data.slice(0, colonIdx);
    return ivPart.length === 24 && /^[0-9a-f]+$/.test(ivPart);
}

/**
 * Safely decrypt data — handles both encrypted and legacy plaintext items.
 * Returns plaintext in both cases.
 */
export function safeDecrypt(data: string): string {
    if (isEncrypted(data)) {
        return decryptInventoryData(data);
    }
    // Legacy plaintext item — return as-is
    return data;
}
