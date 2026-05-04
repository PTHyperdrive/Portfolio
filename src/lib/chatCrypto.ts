/**
 * chatCrypto.ts — Shared E2EE cryptographic primitives for Support Chat.
 *
 * Architecture:
 *   PIN  → PBKDF2 → AES-GCM wrapping key  (protects private key at rest)
 *   ECDH → shared AES-GCM key             (encrypts/decrypts messages)
 *
 * The PIN is NOT the encryption key. PIN is a local UI lock that protects
 * the user's ECDH private key. Each party (user/admin) has their own PIN.
 * Message encryption uses ECDH-derived shared secrets.
 */

const WRAPPING_SALT = new TextEncoder().encode("notrespond-e2ee-wrap-v1");

// ── PIN → Wrapping Key (for encrypting/decrypting ECDH private keys) ─────────

/** Derive an AES-256-GCM wrapping key from a PIN via PBKDF2 (200k iterations). */
export async function pinToWrappingKey(pin: string): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: WRAPPING_SALT, iterations: 200_000, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// ── ECDH Keypair Management ──────────────────────────────────────────────────

/** Generate an extractable ECDH P-256 keypair. */
export async function generateECDHKeypair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,   // extractable — we need to export & encrypt the private key
        ["deriveKey", "deriveBits"]
    );
}

/** Export a public key as a JWK JSON string. */
export async function exportPubKey(key: CryptoKey): Promise<string> {
    return JSON.stringify(await crypto.subtle.exportKey("jwk", key));
}

/** Export a private key as a JWK JSON string (plaintext — encrypt before storing!). */
export async function exportPrivKey(key: CryptoKey): Promise<string> {
    return JSON.stringify(await crypto.subtle.exportKey("jwk", key));
}

/** Encrypt a private key JWK string with a PIN-derived wrapping key. Returns base64 ciphertext + iv. */
export async function encryptPrivateKey(
    privKeyJwk: string, wrappingKey: CryptoKey
): Promise<{ encPrivKey: string; keyIv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, wrappingKey, new TextEncoder().encode(privKeyJwk)
    );
    return {
        encPrivKey: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        keyIv: btoa(String.fromCharCode(...iv)),
    };
}

/** Decrypt an encrypted private key and import it as a non-extractable ECDH key. */
export async function decryptPrivateKey(
    encPrivKeyB64: string, keyIvB64: string, wrappingKey: CryptoKey
): Promise<CryptoKey> {
    const ct = Uint8Array.from(atob(encPrivKeyB64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(keyIvB64), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrappingKey, ct);
    const jwk = JSON.parse(new TextDecoder().decode(decrypted));
    return crypto.subtle.importKey(
        "jwk", jwk,
        { name: "ECDH", namedCurve: "P-256" },
        false,  // non-extractable once imported — security hardening
        ["deriveKey", "deriveBits"]
    );
}

// ── ECDH Shared Key Derivation ───────────────────────────────────────────────

/** Derive a shared AES-256-GCM key from my ECDH private key + their ECDH public key (JWK string). */
export async function deriveSharedKey(
    myPrivateKey: CryptoKey, theirPubKeyJwk: string
): Promise<CryptoKey> {
    const theirPub = await crypto.subtle.importKey(
        "jwk", JSON.parse(theirPubKeyJwk),
        { name: "ECDH", namedCurve: "P-256" }, false, []
    );
    return crypto.subtle.deriveKey(
        { name: "ECDH", public: theirPub },
        myPrivateKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// ── Message Encryption/Decryption ────────────────────────────────────────────

/** Encrypt a plaintext message with an AES-GCM key. Returns base64 ciphertext + iv. */
export async function encryptMessage(
    key: CryptoKey, plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)
    );
    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv)),
    };
}

/** Decrypt a base64-encoded AES-GCM ciphertext. Returns plaintext or null on failure. */
export async function decryptMessage(
    key: CryptoKey, ciphertextB64: string, ivB64: string
): Promise<string | null> {
    try {
        const ct = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
        return new TextDecoder().decode(decrypted);
    } catch {
        return null;
    }
}
