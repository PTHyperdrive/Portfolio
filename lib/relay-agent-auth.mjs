/**
 * Per-machine agent credentials with rolling-code replay protection
 *
 * The shared RELAY_AGENT_TOKEN it replaces had three problems: one secret for
 * every machine, no way to revoke a single one, and — because it was static —
 * a captured handshake stayed valid forever.
 *
 * ── Key fob and car ────────────────────────────────────────────────
 *
 * Same construction a rolling-code remote uses. Both sides hold a shared
 * secret and a counter. Each connection presents
 *
 *     name . counter . HMAC(secret, "name:counter")
 *
 * and the server accepts it only if the counter is strictly greater than the
 * highest one it has already seen. Capturing a handshake off the wire buys
 * nothing: replaying it presents a counter that has been spent, and the server
 * refuses. The next genuine connection uses a number the attacker cannot
 * predict a valid MAC for without the secret.
 *
 * As on a real fob, there is a forward resync window. An agent that reconnects
 * while the server is unreachable still increments, so its counter can run
 * ahead; anything within the window is accepted and the server catches up.
 * Beyond it, the credential has to be rotated — the same as re-pairing a fob
 * that has been pressed out of range too many times.
 *
 * ── Nothing to steal at rest ───────────────────────────────────────
 *
 * The secret is never stored. It is derived from the server master secret, the
 * machine name and a generation number, so the database holds no credential —
 * only a counter and a revocation flag. Bumping the generation retires the old
 * secret permanently, which is what rotation means here.
 *
 * Plain .mjs and raw mariadb because server.mjs runs outside Next and cannot
 * import the Prisma client, the same reason the MCP server talks to the
 * database directly.
 */

import { createRequire } from "node:module";
import { deriveAgentSecret, computeProof, secretsEqual } from "./relay-agent-crypto.mjs";

const require = createRequire(import.meta.url);
const mariadb = require("mariadb");

/**
 * How far ahead of the server a counter may run and still be accepted.
 *
 * Every failed reconnect increments the agent's counter, and the retry backoff
 * tops out at a minute, so a server down for a day advances it by low
 * hundreds. A thousand is comfortable margin without being a meaningful
 * weakening: an attacker still cannot produce a valid MAC for any of them.
 */
const RESYNC_WINDOW = 1000;

let pool = null;

function db() {
    if (pool) return pool;
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error("DATABASE_URL is not set");
    const u = new URL(raw.replace(/^mysql:/, "mariadb:"));
    pool = mariadb.createPool({
        host: u.hostname,
        port: Number(u.port) || 3306,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.slice(1),
        connectionLimit: 3,
    });
    return pool;
}

/**
 * Authenticate `name.counter.proof`.
 *
 * Returns { ok: true, name } or { ok: false, reason }. Reasons are for the
 * server log only — the socket is refused identically whichever it is, so a
 * caller learns nothing about which part they got wrong.
 */
export async function authenticateAgent(header, ip) {
    if (typeof header !== "string" || header.length > 512) {
        return { ok: false, reason: "malformed" };
    }

    const parts = header.split(".");
    if (parts.length !== 3) return { ok: false, reason: "malformed" };

    const [name, counterRaw, proof] = parts;
    const counter = Number(counterRaw);

    if (!/^[\w.@-]{1,60}$/.test(name)) return { ok: false, reason: "malformed" };
    if (!Number.isSafeInteger(counter) || counter <= 0) return { ok: false, reason: "malformed" };
    if (!/^[a-f0-9]{64}$/i.test(proof)) return { ok: false, reason: "malformed" };

    const rows = await db().query(
        "SELECT id, name, generation, counter, revokedAt FROM RelayAgent WHERE name = ? LIMIT 1",
        [name],
    );
    if (!rows.length) return { ok: false, reason: "unknown agent" };

    const agent = rows[0];
    if (agent.revokedAt) return { ok: false, reason: "revoked" };

    const expected = computeProof(deriveAgentSecret(name, agent.generation), name, counter);
    if (!secretsEqual(proof.toLowerCase(), expected)) return { ok: false, reason: "bad proof" };

    // The rolling check. Strictly greater, so the exact handshake just seen on
    // the wire cannot be sent again.
    const last = Number(agent.counter) || 0;
    if (counter <= last) {
        return { ok: false, reason: `replayed counter ${counter} (last accepted ${last})` };
    }
    if (counter > last + RESYNC_WINDOW) {
        return {
            ok: false,
            reason: `counter ${counter} is more than ${RESYNC_WINDOW} ahead of ${last}; rotate the credential`,
        };
    }

    await db().query(
        "UPDATE RelayAgent SET counter = ?, lastSeenAt = NOW(), lastIp = ? WHERE id = ?",
        [counter, (ip || "").slice(0, 64), agent.id],
    );

    return { ok: true, name: agent.name };
}

/**
 * Check a bare per-machine secret, for the agent-source download.
 *
 * That request happens before the machine has an agent to compute a rolling
 * proof with, so it presents the static secret instead. It is only fetching a
 * script that contains no secrets — the point is that the endpoint is not open,
 * and that access can be revoked per machine like everything else.
 */
export async function authenticateAgentSecret(secret) {
    if (typeof secret !== "string" || !/^[a-f0-9]{64}$/i.test(secret)) return null;

    const rows = await db().query(
        "SELECT name, generation FROM RelayAgent WHERE revokedAt IS NULL",
    );
    for (const row of rows) {
        if (secretsEqual(secret.toLowerCase(), deriveAgentSecret(row.name, row.generation))) {
            return row.name;
        }
    }
    return null;
}

export { deriveAgentSecret, computeProof } from "./relay-agent-crypto.mjs";
