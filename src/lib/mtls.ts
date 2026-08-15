/**
 * Mutual TLS for the administrative surface
 *
 * A second, independent factor in front of everything privileged: the browser
 * must present a client certificate signed by a CA you control, and whose
 * fingerprint is on an explicit allowlist. A stolen session cookie, a stolen
 * TOTP code, even a stolen vault token is not enough on its own — without the
 * private key in the device's keystore, TLS never completes.
 *
 * ── Where the check actually happens ───────────────────────────────
 *
 * Not here. TLS terminates at nginx, so nginx is the only thing that can
 * validate a client certificate; this module reads the result nginx passes on.
 * That makes header trust the crux of the whole design.
 *
 * Two things make it sound, and both are required:
 *
 *   1. nginx sets these headers unconditionally on every proxied request, so a
 *      value supplied by a client is overwritten rather than honoured.
 *   2. Next listens on 127.0.0.1 only, so there is no path to it that skips
 *      nginx. Were it still bound to 0.0.0.0, anyone on the LAN could connect
 *      directly and simply assert `X-Client-Verify: SUCCESS`.
 *
 * If you ever move Next off loopback, this becomes a bypass. That is the one
 * invariant worth remembering about this file.
 *
 * ── Cloudflare ─────────────────────────────────────────────────────
 *
 * A proxied (orange-cloud) hostname terminates TLS at Cloudflare, so the client
 * certificate never reaches nginx and verification cannot succeed. The admin
 * hostname must be DNS-only (grey cloud) for mTLS to work at all — which also
 * means the admin surface stops being behind Cloudflare's protections, and is
 * reachable only by whoever can route to the origin. Behind WireGuard that is
 * the point; on the open internet, think about it first.
 */

/** Paths that require a client certificate when enforcement is on. */
const PROTECTED_PREFIXES = [
    "/adminsystemnrsp",
    "/api/admin",
];

export type MtlsVerdict =
    | { ok: true }
    | { ok: false; reason: "no-cert" | "failed-verify" | "unknown-cert" };

/** Whether mTLS is switched on for this deployment. */
export function mtlsEnforced(): boolean {
    return process.env.MTLS_ENFORCE === "true";
}

/** Fingerprints permitted to reach the admin surface. */
function allowedFingerprints(): Set<string> {
    return new Set(
        (process.env.MTLS_ALLOWED_FINGERPRINTS || "")
            .split(",")
            .map(f => f.trim().toLowerCase().replace(/^sha256[:=]/, "").replace(/:/g, ""))
            .filter(Boolean),
    );
}

export function isProtectedPath(pathname: string): boolean {
    return PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Judge one request against the certificate nginx reported.
 *
 * A CA-signed certificate is necessary but not sufficient: the fingerprint must
 * also be listed. Otherwise anyone who ever obtained a certificate from that CA
 * keeps access forever, and revoking one would mean rotating the CA and
 * reissuing to every device.
 */
export function checkClientCertificate(headers: Headers): MtlsVerdict {
    const verify = (headers.get("x-client-verify") || "").toUpperCase();

    // nginx sends NONE when no certificate was offered, and FAILED:<reason>
    // when one was offered but did not validate against the CA.
    if (verify === "NONE" || verify === "") return { ok: false, reason: "no-cert" };
    if (verify !== "SUCCESS") return { ok: false, reason: "failed-verify" };

    const allow = allowedFingerprints();
    // An empty allowlist means "any certificate this CA signed". Since the CA
    // exists only to sign these, that is a coherent choice — but it is a
    // deliberate one, so it is spelled out rather than implied.
    if (allow.size === 0) return { ok: true };

    const fingerprint = (headers.get("x-client-fingerprint") || "")
        .trim().toLowerCase().replace(/^sha256[:=]/, "").replace(/:/g, "");

    return allow.has(fingerprint) ? { ok: true } : { ok: false, reason: "unknown-cert" };
}
