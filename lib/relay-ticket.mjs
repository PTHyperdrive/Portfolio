/**
 * Short-lived tickets authorising a relay WebSocket
 *
 * A browser cannot set an Authorization header on a WebSocket, and the custom
 * server in server.mjs runs outside Next's request pipeline, so it cannot read
 * a NextAuth session. The usual fix is a ticket: an authenticated HTTP route
 * mints one, the browser puts it in the upgrade URL, and the socket server
 * verifies it.
 *
 * The ticket is a signed statement rather than a database row on purpose — the
 * upgrade handler and the API route are separate module registries in the same
 * process, so anything held in memory on one side is invisible to the other.
 * An HMAC needs no shared state at all: both sides only need the secret.
 *
 * Lifetime is deliberately tiny. The ticket travels in a URL, which is the one
 * place credentials leak into logs and Referer headers, so it is useless within
 * half a minute of being issued.
 *
 * Plain .mjs so server.mjs can import it directly and the TypeScript routes can
 * import the same file — no second implementation to drift.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** How long a freshly minted ticket stays valid. */
export const TICKET_TTL_MS = 30_000;

function secret() {
    const value = process.env.RELAY_TICKET_SECRET || process.env.AUTH_SECRET;
    if (!value) {
        throw new Error(
            "Neither RELAY_TICKET_SECRET nor AUTH_SECRET is set, so relay tickets cannot be signed.",
        );
    }
    return value;
}

const b64url = buf => Buffer.from(buf).toString("base64url");

function sign(payload) {
    return createHmac("sha256", secret()).update(payload).digest();
}

/** Mint a ticket asserting that `userId` may open a relay console. */
export function issueTicket(userId) {
    const payload = b64url(JSON.stringify({ sub: userId, exp: Date.now() + TICKET_TTL_MS }));
    return `${payload}.${b64url(sign(payload))}`;
}

/**
 * Verify a ticket. Returns the user id, or null for anything malformed,
 * mis-signed or expired — the caller should treat every null identically and
 * never report which of the three it was.
 */
export function verifyTicket(ticket) {
    if (typeof ticket !== "string" || ticket.length > 512) return null;

    const dot = ticket.indexOf(".");
    if (dot <= 0) return null;

    const payload = ticket.slice(0, dot);
    let given;
    try {
        given = Buffer.from(ticket.slice(dot + 1), "base64url");
    } catch {
        return null;
    }

    let expected;
    try {
        expected = sign(payload);
    } catch {
        return null; // no secret configured
    }

    // Compare before parsing, and only on equal lengths — timingSafeEqual
    // throws otherwise, which would itself leak length through the error path.
    if (given.length !== expected.length) return null;
    if (!timingSafeEqual(given, expected)) return null;

    try {
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (typeof claims?.sub !== "string" || typeof claims?.exp !== "number") return null;
        if (Date.now() > claims.exp) return null;
        return claims.sub;
    } catch {
        return null;
    }
}

/**
 * Constant-time check of the agent's bearer token.
 *
 * Separate from tickets: the agent is a long-lived daemon on the operator's own
 * VM, so it holds a static secret rather than re-minting a ticket per connect.
 */
export function verifyAgentToken(given) {
    const expected = process.env.RELAY_AGENT_TOKEN;
    if (!expected || typeof given !== "string") return false;

    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}
