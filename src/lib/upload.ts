import crypto from "crypto";
import path from "path";
import { writeFile, mkdir, unlink } from "fs/promises";

/**
 * upload.ts — Centralized Secure File Upload Pipeline
 *
 * Security measures:
 * 1. Magic byte validation (anti-spoofing — ignores client MIME type)
 * 2. SHA-256 stream hashing (integrity + duplicate detection)
 * 3. EXIF stripping + re-encoding via Sharp (RCE prevention)
 * 4. SVG/archive rejection (XXE/SSRF/zip bomb prevention)
 * 5. Per-context size limits
 * 6. Isolated non-public storage
 */

// ─── Types ─────────────────────────────────────────────────

export type UploadContext = "TICKET" | "CHAT" | "AVATAR" | "MMO_ITEM" | "CMS_COVER";

export interface UploadResult {
    storedName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
}

export interface UploadError {
    fileName: string;
    error: string;
}

// ─── Configuration ─────────────────────────────────────────

const STORAGE_ROOT = path.join(process.cwd(), "data", "uploads");

const CONTEXT_DIRS: Record<UploadContext, string> = {
    TICKET: "tickets",
    CHAT: "chat",
    AVATAR: "avatars",
    MMO_ITEM: "mmo",
    CMS_COVER: "cms",
};

/** Per-context max file size in bytes */
const SIZE_LIMITS: Record<UploadContext, number> = {
    TICKET: 18 * 1024 * 1024,   // 18 MB — evidence images
    CHAT: 10 * 1024 * 1024,     // 10 MB
    AVATAR: 5 * 1024 * 1024,    // 5 MB
    MMO_ITEM: 10 * 1024 * 1024, // 10 MB
    CMS_COVER: 10 * 1024 * 1024, // 10 MB
};

/** Per-context max file count per upload request */
const COUNT_LIMITS: Record<UploadContext, number> = {
    TICKET: 5,
    CHAT: 3,
    AVATAR: 1,
    MMO_ITEM: 5,
    CMS_COVER: 1,
};

// ─── Magic Byte Signatures ─────────────────────────────────

interface MagicSignature {
    bytes: number[];
    offset: number;
    mime: string;
    ext: string;
}

const MAGIC_SIGNATURES: MagicSignature[] = [
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], offset: 0, mime: "image/png", ext: "png" },
    // JPEG: FF D8 FF
    { bytes: [0xFF, 0xD8, 0xFF], offset: 0, mime: "image/jpeg", ext: "jpg" },
    // WebP: RIFF....WEBP
    { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, mime: "image/webp", ext: "webp" },
    // GIF87a
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], offset: 0, mime: "image/gif", ext: "gif" },
    // GIF89a
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], offset: 0, mime: "image/gif", ext: "gif" },
];

/** Dangerous archive magic bytes — always rejected */
const ARCHIVE_SIGNATURES: number[][] = [
    [0x50, 0x4B, 0x03, 0x04],       // ZIP
    [0x1F, 0x8B],                     // GZIP
    [0x52, 0x61, 0x72, 0x21],         // RAR
    [0x37, 0x7A, 0xBC, 0xAF],         // 7z
    [0x42, 0x5A, 0x68],               // BZ2
    [0xFD, 0x37, 0x7A, 0x58, 0x5A],   // XZ
];

// ─── Core Functions ────────────────────────────────────────

/**
 * Identify file type by reading magic bytes.
 * Returns null if the file doesn't match any known safe image format.
 */
function identifyByMagicBytes(buffer: Buffer): { mime: string; ext: string } | null {
    // First check for dangerous archives
    for (const sig of ARCHIVE_SIGNATURES) {
        if (buffer.length >= sig.length) {
            let match = true;
            for (let i = 0; i < sig.length; i++) {
                if (buffer[i] !== sig[i]) { match = false; break; }
            }
            if (match) return null; // Archive detected — reject
        }
    }

    // Check for SVG (text-based XML) — reject
    const head = buffer.subarray(0, 256).toString("utf8").trim().toLowerCase();
    if (head.startsWith("<?xml") || head.startsWith("<svg") || head.includes("<svg")) {
        return null;
    }

    // Check for valid image signatures
    for (const sig of MAGIC_SIGNATURES) {
        if (buffer.length < sig.offset + sig.bytes.length) continue;
        let match = true;
        for (let i = 0; i < sig.bytes.length; i++) {
            if (buffer[sig.offset + i] !== sig.bytes[i]) { match = false; break; }
        }
        if (match) {
            // WebP needs additional check: bytes 8-11 must be "WEBP"
            if (sig.mime === "image/webp") {
                if (buffer.length < 12) return null;
                const riffType = buffer.subarray(8, 12).toString("ascii");
                if (riffType !== "WEBP") return null;
            }
            return { mime: sig.mime, ext: sig.ext };
        }
    }

    return null;
}

/**
 * Compute SHA-256 hash of a buffer.
 */
function computeSha256(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Strip EXIF metadata and re-encode image using Sharp.
 * Re-encoding destroys polyglot payloads and steganographic content.
 * Falls back to original buffer if Sharp is not available.
 */
async function sanitizeImage(buffer: Buffer, mime: string): Promise<Buffer> {
    try {
        // Dynamic import — Sharp may not be installed in dev
        const sharp = (await import("sharp")).default;

        let pipeline = sharp(buffer).rotate(); // .rotate() auto-orients and strips EXIF

        switch (mime) {
            case "image/png":
                pipeline = pipeline.png({ effort: 4 });
                break;
            case "image/jpeg":
                pipeline = pipeline.jpeg({ quality: 92, mozjpeg: true });
                break;
            case "image/webp":
                pipeline = pipeline.webp({ quality: 90 });
                break;
            case "image/gif":
                // Sharp's GIF support is limited; just strip metadata
                pipeline = pipeline.gif();
                break;
        }

        return await pipeline.toBuffer();
    } catch (err) {
        // Sharp not installed — log warning and return original buffer
        console.warn("[upload] Sharp not available, skipping EXIF strip:", (err as Error).message);
        return buffer;
    }
}

/**
 * Get the storage directory path for a given upload context.
 */
function getStorageDir(context: UploadContext): string {
    return path.join(STORAGE_ROOT, CONTEXT_DIRS[context]);
}

// ─── Public API ────────────────────────────────────────────

/**
 * Process a single file through the full security pipeline:
 * 1. Size check
 * 2. Magic byte validation
 * 3. SHA-256 hashing
 * 4. EXIF strip + re-encode
 * 5. Write to isolated storage
 *
 * Returns UploadResult on success, throws descriptive error on failure.
 */
export async function processUpload(
    file: File,
    context: UploadContext,
    uploaderId: string
): Promise<UploadResult> {
    const originalName = file.name || "unnamed";

    // ── 1. Size enforcement ──
    const maxSize = SIZE_LIMITS[context];
    if (file.size > maxSize) {
        const limitMb = Math.round(maxSize / 1024 / 1024);
        throw new Error(`File "${originalName}" exceeds ${limitMb} MB limit.`);
    }

    if (file.size === 0) {
        throw new Error(`File "${originalName}" is empty.`);
    }

    // ── 2. Read file buffer ──
    const rawBuffer = Buffer.from(await file.arrayBuffer());

    // ── 3. Magic byte validation (ignores client MIME) ──
    const identity = identifyByMagicBytes(rawBuffer);
    if (!identity) {
        throw new Error(
            `File "${originalName}" is not a valid image. ` +
            `Only PNG, JPEG, WebP, and GIF are allowed. SVG and archive files are blocked.`
        );
    }

    // ── 4. SHA-256 hash of raw file ──
    const sha256 = computeSha256(rawBuffer);

    // ── 5. EXIF strip + re-encode ──
    const sanitized = await sanitizeImage(rawBuffer, identity.mime);

    // ── 6. Generate unique stored filename ──
    const random = crypto.randomBytes(12).toString("hex");
    const storedName = `${uploaderId}_${Date.now()}_${random}.${identity.ext}`;

    // ── 7. Write to isolated storage ──
    const storageDir = getStorageDir(context);
    await mkdir(storageDir, { recursive: true });
    const filePath = path.join(storageDir, storedName);
    await writeFile(filePath, sanitized);

    return {
        storedName,
        originalName,
        mimeType: identity.mime,
        sizeBytes: sanitized.length,
        sha256,
    };
}

/**
 * Validate the upload context string.
 */
export function isValidContext(value: string): value is UploadContext {
    return ["TICKET", "CHAT", "AVATAR", "MMO_ITEM", "CMS_COVER"].includes(value);
}

/**
 * Get the max file count for a given context.
 */
export function getMaxFileCount(context: UploadContext): number {
    return COUNT_LIMITS[context];
}

/**
 * Get the full filesystem path for a stored file.
 */
export function getStoredFilePath(context: UploadContext, storedName: string): string {
    // Prevent directory traversal
    const safeName = path.basename(storedName);
    return path.join(getStorageDir(context), safeName);
}

/**
 * Delete a stored file from the filesystem.
 */
export async function deleteStoredFile(context: UploadContext, storedName: string): Promise<void> {
    try {
        const filePath = getStoredFilePath(context, storedName);
        await unlink(filePath);
    } catch {
        // File may already be deleted — swallow
    }
}
