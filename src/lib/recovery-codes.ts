/**
 * Backup recovery codes — the last line of 2FA.
 *
 * A user generates a set of high-entropy, single-use codes (shown exactly
 * once). Each code is SHA-256 hashed at rest. Regenerating replaces the whole
 * set and re-arms the lifetime guard.
 *
 * Hardening — lifetime attempt cap:
 *   Every submission at login (whether the code is right OR wrong) increments
 *   User.recoveryAttempts. Once it reaches MAX_LIFETIME_ATTEMPTS the method is
 *   permanently locked (recoveryLockedAt) — backup codes stop being accepted
 *   and the user must use another 2FA method or open a support ticket. This
 *   means an attacker gets at most MAX_LIFETIME_ATTEMPTS lifetime guesses.
 *   The only reset is the owner regenerating a fresh set while authenticated.
 */

import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";

/** Number of codes minted per set. */
export const CODE_COUNT = 10;
/** Hard lifetime cap on backup-code submissions (right or wrong) before lock. */
export const MAX_LIFETIME_ATTEMPTS = 10;

// Crockford base32 minus ambiguous letters (no I, L, O, U) — easy to read
// aloud and to type. 32 symbols means a raw byte's low 5 bits map uniformly
// (256 % 32 === 0), so there is no modulo bias.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RAW_LEN = 10; // 10 symbols × 5 bits = 50 bits of entropy per code

export interface RecoveryStatus {
    /** Whether the user has ever generated a set. */
    generated: boolean;
    /** Unused codes still available. */
    totalRemaining: number;
    /** Lifetime submissions consumed. */
    attemptsUsed: number;
    /** The cap (MAX_LIFETIME_ATTEMPTS). */
    attemptsMax: number;
    /** True once locked — backup codes are no longer accepted. */
    locked: boolean;
}

export interface VerifyResult {
    /** The submitted code matched a live, unused code. */
    ok: boolean;
    /** The account is (now) locked out of backup codes. */
    locked: boolean;
    /** Lifetime attempts remaining after this submission. */
    remainingAttempts: number;
}

/** One raw code, formatted for display: e.g. "A1B2C-D3E4F". */
function randomCode(): string {
    const bytes = randomBytes(RAW_LEN);
    let out = "";
    for (let i = 0; i < RAW_LEN; i++) out += ALPHABET[bytes[i] & 31];
    return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/**
 * Canonicalise user input before hashing/lookup: uppercase, drop everything
 * but A–Z/0–9, and fold the lookalikes a user might type for the symbols we
 * never mint (I/L→1, O→0) so honest typos still match.
 */
export function normalizeCode(raw: string): string {
    return raw
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .replace(/[IL]/g, "1")
        .replace(/O/g, "0");
}

function hashCode(normalized: string): string {
    return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generate a fresh set of codes, replacing any prior set and re-arming the
 * lifetime guard. Returns the plaintext codes — they are shown to the user
 * exactly once and never recoverable afterwards.
 */
export async function generateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: CODE_COUNT }, randomCode);

    await prisma.$transaction([
        prisma.recoveryCode.deleteMany({ where: { userId } }),
        prisma.recoveryCode.createMany({
            data: codes.map((c) => ({ userId, codeHash: hashCode(normalizeCode(c)) })),
        }),
        prisma.user.update({
            where: { id: userId },
            data: {
                recoveryAttempts: 0,
                recoveryLockedAt: null,
                recoveryCodesGeneratedAt: new Date(),
            },
        }),
    ]);

    return codes;
}

/**
 * Verify a submitted backup code at login. ALWAYS counts toward the lifetime
 * cap first (so wrong guesses burn the budget), then checks the code. Returns
 * ok only on an exact, unused match while the account is not locked.
 */
export async function verifyRecoveryCode(
    userId: string,
    submitted: string,
): Promise<VerifyResult> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { recoveryAttempts: true, recoveryLockedAt: true },
    });

    // Already locked (flag set, or counter at/over the cap) → reject outright,
    // without burning another attempt.
    if (!user || user.recoveryLockedAt || user.recoveryAttempts >= MAX_LIFETIME_ATTEMPTS) {
        return { ok: false, locked: true, remainingAttempts: 0 };
    }

    // This submission counts no matter what. Increment atomically and lock if
    // it tips us over the cap.
    const updated = await prisma.user.update({
        where: { id: userId },
        data: { recoveryAttempts: { increment: 1 } },
        select: { recoveryAttempts: true },
    });
    const locked = updated.recoveryAttempts >= MAX_LIFETIME_ATTEMPTS;
    if (locked) {
        await prisma.user.update({
            where: { id: userId },
            data: { recoveryLockedAt: new Date() },
        });
    }
    const remainingAttempts = Math.max(0, MAX_LIFETIME_ATTEMPTS - updated.recoveryAttempts);

    const normalized = normalizeCode(submitted);
    if (normalized.length < 8) return { ok: false, locked, remainingAttempts };

    const rec = await prisma.recoveryCode.findFirst({
        where: { userId, codeHash: hashCode(normalized), usedAt: null },
        select: { id: true },
    });
    if (!rec) return { ok: false, locked, remainingAttempts };

    await prisma.recoveryCode.update({
        where: { id: rec.id },
        data: { usedAt: new Date() },
    });
    return { ok: true, locked, remainingAttempts };
}

/** Snapshot of a user's backup-code state for the UI / precheck. */
export async function getRecoveryStatus(userId: string): Promise<RecoveryStatus> {
    const [user, totalRemaining] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { recoveryAttempts: true, recoveryLockedAt: true, recoveryCodesGeneratedAt: true },
        }),
        prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
    ]);

    const attemptsUsed = user?.recoveryAttempts ?? 0;
    return {
        generated: !!user?.recoveryCodesGeneratedAt,
        totalRemaining,
        attemptsUsed,
        attemptsMax: MAX_LIFETIME_ATTEMPTS,
        locked: !!user?.recoveryLockedAt || attemptsUsed >= MAX_LIFETIME_ATTEMPTS,
    };
}

/** True when a backup code can actually be used to log in right now. */
export function recoveryAvailable(s: RecoveryStatus): boolean {
    return s.generated && !s.locked && s.totalRemaining > 0;
}
