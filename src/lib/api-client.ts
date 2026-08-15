"use client";

/**
 * Client-side fetch that carries a vault token when one is held
 *
 * The Studio is reached two ways: normally, through a signed-in session where
 * the cookie authenticates every request; and through the vault page, which
 * stores nothing at all and must present a bearer token instead.
 *
 * Rather than thread a token through every component, the token lives in this
 * module and `apiFetch` adds the header when it is set. With no token this is
 * exactly `fetch`, so the ordinary session path is untouched.
 *
 * Deliberately a module variable and not React state, and deliberately not
 * localStorage or sessionStorage: the whole point of the vault page is that
 * closing the tab leaves nothing behind. A reload clears this by construction.
 */

let vaultToken: string | null = null;

/** Callbacks fired when the server stops accepting our token. */
const expiryListeners = new Set<() => void>();

export function setVaultToken(token: string | null): void {
    vaultToken = token;
}

export function hasVaultToken(): boolean {
    return vaultToken !== null;
}

/**
 * Register a handler for "the token is no longer accepted".
 *
 * The vault page uses this to drop straight back to the keypad rather than
 * leaving a dead UI that fails every action silently.
 */
export function onVaultExpired(fn: () => void): () => void {
    expiryListeners.add(fn);
    return () => expiryListeners.delete(fn);
}

/**
 * fetch, plus the vault bearer token when there is one.
 *
 * A 401 while holding a token means it expired or the server restarted — the
 * in-memory store does not survive either — so listeners are notified and the
 * token dropped.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    if (!vaultToken) return fetch(input, init);

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${vaultToken}`);

    const res = await fetch(input, { ...init, headers });

    if (res.status === 401) {
        vaultToken = null;
        for (const fn of expiryListeners) {
            try { fn(); } catch { /* a bad listener must not break the caller */ }
        }
    }

    return res;
}
