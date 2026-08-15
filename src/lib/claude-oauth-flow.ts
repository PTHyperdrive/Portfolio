/**
 * Cookie plumbing for the Claude subscription login
 *
 * Two short-lived httpOnly cookies carry the parts of the flow that page
 * script has no business holding:
 *
 *   FLOW_COOKIE     the PKCE verifier and the CSRF state, written by /start
 *                   and consumed by /exchange.
 *   REFRESH_COOKIE  the refresh token, written by /exchange and consumed by
 *                   the node create/update route.
 *
 * The refresh token is the more sensitive half of an OAuth grant — it mints
 * new access tokens long after the original expires. Routing it through an
 * httpOnly cookie keeps it out of JavaScript entirely, so the browser can fill
 * in the access token the admin needs to see without ever touching the
 * credential that outlives it.
 *
 * Path is scoped to /api/admin/ai so these are not attached to unrelated
 * requests, and both expire in ten minutes — long enough to finish a login,
 * short enough that an abandoned attempt leaves nothing behind.
 */

export const FLOW_COOKIE = "claude_oauth_flow";
export const REFRESH_COOKIE = "claude_oauth_refresh";

const TEN_MINUTES = 600;

export function cookieOptions(secure: boolean) {
    return {
        httpOnly: true,
        secure,
        // Lax rather than Strict: the callback is a top-level navigation back
        // from claude.ai, and Strict would withhold the cookie on that hop.
        sameSite: "lax" as const,
        path: "/api/admin/ai",
        maxAge: TEN_MINUTES,
    };
}

/** Options that clear a cookie set with cookieOptions(). */
export function clearOptions(secure: boolean) {
    return { ...cookieOptions(secure), maxAge: 0 };
}

export interface FlowState {
    state: string;
    codeVerifier: string;
    redirectUri: string;
}

/** Parse the flow cookie, returning null when absent or malformed. */
export function readFlowState(raw: string | undefined): FlowState | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed?.state === "string" && typeof parsed?.codeVerifier === "string"
            ? parsed as FlowState
            : null;
    } catch {
        return null;
    }
}
