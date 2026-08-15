/**
 * Relay agent credential maths — no database, no bundler hazards
 *
 * Split out from relay-agent-auth.mjs because that module reaches the database
 * through `createRequire("mariadb")`, which server.mjs needs (it runs outside
 * Next and cannot use Prisma) but which Next's bundler rewrites into something
 * broken when a route imports it — the symptom was a 500 with
 * "_.createPool is not a function".
 *
 * So the shape is: this file holds the crypto and is safe to import anywhere;
 * each side does its own database access in whatever way suits it.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

function masterSecret() {
    const value = process.env.RELAY_TICKET_SECRET || process.env.AUTH_SECRET;
    if (!value) throw new Error("Neither RELAY_TICKET_SECRET nor AUTH_SECRET is set");
    return value;
}

/**
 * The secret for one machine at one generation.
 *
 * Derived rather than stored, so a database dump contains no usable
 * credential, and rotation is a single integer increment.
 */
export function deriveAgentSecret(name, generation) {
    return createHmac("sha256", masterSecret())
        .update(`relay-agent:${name}:${generation}`)
        .digest("hex");
}

/** The proof an agent sends: HMAC over its own name and counter. */
export function computeProof(secret, name, counter) {
    return createHmac("sha256", secret).update(`${name}:${counter}`).digest("hex");
}

/** Length-safe constant-time comparison of two strings. */
export function secretsEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && timingSafeEqual(x, y);
}
