/**
 * TOTP Secret Encryption — AES-256-GCM at Rest
 *
 * Encrypts the base32 TOTP secret before writing to the database,
 * and decrypts it only when verifying a user's authenticator code.
 *
 * Key management:
 *   - Key sourced from `process.env.TOTP_ENCRYPTION_KEY` (64 hex chars = 32 bytes)
 *   - Each secret gets a unique 96-bit random IV (prepended to ciphertext)
 *   - AES-GCM provides both confidentiality and authentication (tamper detection)
 *
 * Storage format: hex(iv):hex(ciphertext+authTag)
 *   - iv = 12 bytes (24 hex chars)
 *   - ciphertext includes the 16-byte GCM auth tag appended by Node.js crypto
 *
 * If TOTP_ENCRYPTION_KEY is not set, functions throw immediately — this is
 * intentional to prevent silent fallback to plaintext storage.
 *
 * Generate a key with:  openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;         // 96-bit IV (NIST recommended for GCM)
const AUTH_TAG_LENGTH = 16;   // 128-bit authentication tag

/**
 * Get the encryption key from environment.
 * Throws if not configured — prevents accidental plaintext storage.
 */
function getKey(): Buffer {
    const hex = process.env.TOTP_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error(
            "[totp-crypto] TOTP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
            "Generate one with: openssl rand -hex 32"
        );
    }
    return Buffer.from(hex, "hex");
}

/**
 * Encrypt a base32 TOTP secret with AES-256-GCM.
 *
 * @param secret — Raw base32 secret from speakeasy
 * @returns Encrypted string in format "hex(iv):hex(ciphertext+tag)"
 */
export function encryptTotpSecret(secret: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
        cipher.update(secret, "utf8"),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    const ivHex = iv.toString("hex");
    const ctHex = Buffer.concat([encrypted, authTag]).toString("hex");

    return `${ivHex}:${ctHex}`;
}

/**
 * Decrypt an AES-256-GCM encrypted TOTP secret.
 *
 * @param encrypted — String in format "hex(iv):hex(ciphertext+tag)"
 * @returns Decrypted base32 secret
 * @throws Error if data is tampered with, key is wrong, or format is invalid
 */
export function decryptTotpSecret(encrypted: string): string {
    const key = getKey();

    const colonIdx = encrypted.indexOf(":");
    if (colonIdx === -1) {
        throw new Error("[totp-crypto] Invalid encrypted data format (missing IV separator)");
    }

    const ivHex = encrypted.slice(0, colonIdx);
    const ctWithTagHex = encrypted.slice(colonIdx + 1);

    const iv = Buffer.from(ivHex, "hex");
    const ctWithTag = Buffer.from(ctWithTagHex, "hex");

    if (iv.length !== IV_LENGTH) {
        throw new Error(`[totp-crypto] Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
    }

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
 * Check if a stored secret appears to be encrypted (has the iv:ct format).
 * Used for backward compatibility with pre-encryption secrets.
 */
function isEncrypted(data: string): boolean {
    const colonIdx = data.indexOf(":");
    if (colonIdx === -1) return false;
    const ivPart = data.slice(0, colonIdx);
    return ivPart.length === 24 && /^[0-9a-f]+$/.test(ivPart);
}

/**
 * Safely decrypt a TOTP secret — handles both encrypted and legacy plaintext.
 * Returns the base32 secret in both cases.
 */
export function safeDecryptTotpSecret(data: string): string {
    if (isEncrypted(data)) {
        return decryptTotpSecret(data);
    }
    // Legacy plaintext base32 secret — return as-is
    return data;
}
