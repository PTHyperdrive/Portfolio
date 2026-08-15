import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/db";
import { decryptTotpSecret } from "@/lib/totp-crypto";

/**
 * Vault authentication — a TOTP-only door with no cookie behind it
 *
 * The Studio is reachable at an unguessable path, entered with a one-time code
 * typed on screen rather than on a keyboard, and holds no persistent session.
 * Close the tab and you are back at the keypad.
 *
 * ── The code never crosses the wire ────────────────────────────────
 *
 * Sending a six-digit OTP in a request body means anything that can read the
 * request holds a usable credential for the rest of its window. Instead the
 * server issues a random nonce and the browser returns
 * HMAC-SHA256(key = the code, message = the nonce). The server recomputes that
 * for each code valid in the current window and compares.
 *
 * What that buys, precisely:
 *   - the code itself is never transmitted, so a keylogger on the wire gets
 *     nothing reusable;
 *   - the nonce is single-use and short-lived, so a captured request cannot be
 *     replayed even seconds later.
 *
 * What it does not buy, and I would rather say so than imply otherwise:
 * this is not "MITM proof". TLS is what prevents interception. Anyone who can
 * terminate TLS sees the session token that comes back and can use it until it
 * expires. The challenge-response narrows the exposure from "a reusable code"
 * to "one short-lived token"; it does not remove it.
 *
 * ── Why in-memory, and what that costs ─────────────────────────────
 *
 * Nonces and tokens live in this process only. That is what "no session, no
 * cookie" means in practice, and it has a real consequence worth knowing: a
 * deploy or a pm2 restart invalidates every open vault session. Given the page
 * is meant for one operator and re-entry is six digits, that is the right
 * trade — but it is a trade, not a free win.
 */

/** How long a challenge stays answerable. Long enough to tap six keys. */
const NONCE_TTL_MS = 90_000;

/** Idle lifetime of a vault token. Any authenticated request extends it. */
const TOKEN_TTL_MS = 30 * 60_000;

/** Failed attempts tolerated per window before the door stops answering. */
const MAX_FAILURES = 8;
const FAILURE_WINDOW_MS = 10 * 60_000;

interface Challenge { nonce: string; expiresAt: number }
interface VaultToken { userId: string; expiresAt: number }

const challenges = new Map<string, Challenge>();
const tokens = new Map<string, VaultToken>();
const failures: number[] = [];

/** Drop anything past its expiry. Cheap enough to run on every call. */
function sweep(): void {
    const now = Date.now();
    for (const [id, c] of challenges) if (c.expiresAt <= now) challenges.delete(id);
    for (const [t, v] of tokens) if (v.expiresAt <= now) tokens.delete(t);
    while (failures.length && failures[0] <= now - FAILURE_WINDOW_MS) failures.shift();
}

/* ─── The secret path ────────────────────────────────────────────── */

/**
 * Whether a path segment is the configured entrance.
 *
 * Compared in constant time so the URL cannot be recovered a character at a
 * time. Returns false when unconfigured — the page must not exist by default,
 * or every deployment would ship an open door at a guessable path.
 */
export function isVaultPath(segment: string): boolean {
    const expected = process.env.VAULT_PATH_SECRET;
    if (!expected || expected.length < 16) return false;

    const a = Buffer.from(segment);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

export function vaultConfigured(): boolean {
    return Boolean(
        process.env.VAULT_PATH_SECRET
        && process.env.VAULT_PATH_SECRET.length >= 16
        && process.env.VAULT_ADMIN_EMAIL,
    );
}

/* ─── Challenge / response ───────────────────────────────────────── */

export function issueChallenge(): { id: string; nonce: string; expiresInMs: number } {
    sweep();
    const id = randomBytes(16).toString("hex");
    const nonce = randomBytes(32).toString("hex");
    challenges.set(id, { nonce, expiresAt: Date.now() + NONCE_TTL_MS });
    return { id, nonce, expiresInMs: NONCE_TTL_MS };
}

export function lockedOut(): boolean {
    sweep();
    return failures.length >= MAX_FAILURES;
}

export type VaultResult =
    | { ok: true; token: string; userId: string; expiresInMs: number }
    | { ok: false; reason: "locked" | "expired" | "rejected" | "unconfigured" };

/**
 * Verify a proof against every code valid right now.
 *
 * A window of ±1 step is checked, which is what makes the page usable on a
 * phone whose clock has drifted a little. Each candidate is HMAC'd and
 * compared in constant time.
 */
export async function verifyProof(challengeId: string, proof: string): Promise<VaultResult> {
    sweep();

    if (failures.length >= MAX_FAILURES) return { ok: false, reason: "locked" };

    const challenge = challenges.get(challengeId);
    // Single use, whatever the outcome — a nonce that survives a wrong answer
    // is a nonce an attacker can grind against.
    challenges.delete(challengeId);
    if (!challenge || challenge.expiresAt <= Date.now()) return { ok: false, reason: "expired" };

    const email = process.env.VAULT_ADMIN_EMAIL;
    if (!email) return { ok: false, reason: "unconfigured" };

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true, twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user || user.role !== "ADMIN" || !user.twoFactorEnabled || !user.twoFactorSecret) {
        return { ok: false, reason: "unconfigured" };
    }

    let secret: string | null;
    try {
        secret = decryptTotpSecret(user.twoFactorSecret);
    } catch {
        return { ok: false, reason: "unconfigured" };
    }
    if (!secret) return { ok: false, reason: "unconfigured" };

    const given = Buffer.from(proof.toLowerCase(), "utf8");
    let matched = false;

    // The usual totp.verify() cannot be used here: the server never sees the
    // code, only an HMAC keyed by it. So each code valid in the window is
    // generated and HMAC'd for comparison. speakeasy, matching the rest of the
    // codebase, and ±1 step so a phone with slight clock drift still works.
    //
    // Every candidate is tested with no early exit, so how long this takes
    // does not reveal which step matched.
    const step = 30;
    const now = Math.floor(Date.now() / 1000);

    for (const drift of [-1, 0, 1]) {
        const code = speakeasy.totp({
            secret,
            encoding: "base32",
            time: now + drift * step,
        });
        const expected = Buffer.from(
            createHmac("sha256", code).update(challenge.nonce).digest("hex"),
            "utf8",
        );
        if (given.length === expected.length && timingSafeEqual(given, expected)) matched = true;
    }

    if (!matched) {
        failures.push(Date.now());
        return { ok: false, reason: "rejected" };
    }

    const token = randomBytes(32).toString("hex");
    tokens.set(token, { userId: user.id, expiresAt: Date.now() + TOKEN_TTL_MS });
    return { ok: true, token, userId: user.id, expiresInMs: TOKEN_TTL_MS };
}

/**
 * Resolve a bearer token to a user, extending its idle lifetime.
 *
 * Returns null for anything unknown or expired, which the caller must treat as
 * "show the keypad again" rather than as an error worth explaining.
 */
export function resolveVaultToken(token: string | null | undefined): string | null {
    if (!token) return null;
    sweep();
    const entry = tokens.get(token);
    if (!entry) return null;
    entry.expiresAt = Date.now() + TOKEN_TTL_MS;
    return entry.userId;
}

/** Drop a token immediately — used when the page is closed deliberately. */
export function revokeVaultToken(token: string | null | undefined): void {
    if (token) tokens.delete(token);
}

/** Pull the bearer token off a request, if it carries one. */
export function bearerFrom(req: Request): string | null {
    const header = req.headers.get("authorization") || "";
    return header.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}
