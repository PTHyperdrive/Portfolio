import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { securityHeaders } from '@/lib/security';
import { mtlsEnforced, isProtectedPath, checkClientCertificate } from '@/lib/mtls';

/** Check for an active session token (works in both dev and prod). */
function getSessionToken(request: NextRequest): string | undefined {
    return request.cookies.get('authjs.session-token')?.value
        || request.cookies.get('__Secure-authjs.session-token')?.value;
}

/** Allowed origins for CSRF validation. */
const ALLOWED_ORIGINS = new Set([
    'https://www.notrespond.com',
    'https://notrespond.com',
    'https://lab.notrespond.com',
]);

/** The bare domain, with no subdomain in front of it. */
const APEX_HOST = 'notrespond.com';

/**
 * CSRF Origin validation for state-changing requests.
 * Compares Origin (or Referer) header against the set of allowed origins.
 * Returns true if the request is safe, false if it should be blocked.
 */
function validateCsrfOrigin(request: NextRequest): boolean {
    const method = request.method.toUpperCase();
    // Only validate state-changing methods
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');

    // In development, allow localhost
    if (process.env.NODE_ENV === 'development') return true;

    // Check Origin header first (preferred)
    if (origin) {
        return ALLOWED_ORIGINS.has(origin);
    }

    // Fall back to Referer header
    if (referer) {
        try {
            return ALLOWED_ORIGINS.has(new URL(referer).origin);
        } catch {
            return false;
        }
    }

    // No Origin or Referer — reject (strict mode)
    return false;
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // ── Bare domain → www ──
    // notrespond.com and www.notrespond.com are separate DNS records and only
    // www points at the web origin, so the bare domain is a dead end for
    // anyone who omits the prefix. Send it to www instead.
    //
    // /api/ is deliberately excluded: a redirect on a POST can drop the body,
    // and external callers (payment webhooks) are configured against the bare
    // domain — silently redirecting those would break them.
    const host = request.headers.get('host')?.split(':')[0].toLowerCase();
    if (host === APEX_HOST && !pathname.startsWith('/api/')) {
        const target = new URL(request.url);
        target.protocol = 'https:';
        target.host = `www.${APEX_HOST}`;
        target.port = '';
        return NextResponse.redirect(target, 301);
    }

    // ── Mutual TLS on the administrative surface ──
    // Ahead of session handling on purpose: without a client certificate there
    // is nothing to discuss, whatever cookie or token the caller holds. nginx
    // has already validated the certificate against the CA; this only reads
    // the verdict and checks the fingerprint against the allowlist.
    //
    // Safe to trust those headers only because nginx sets them on every
    // proxied request and Next listens on 127.0.0.1, so nothing can reach it
    // without passing through nginx first.
    if (mtlsEnforced() && isProtectedPath(pathname)) {
        const verdict = checkClientCertificate(request.headers);
        if (!verdict.ok) {
            console.warn(`[mtls] refused ${pathname}: ${verdict.reason}`);
            // 403 with no detail about which check failed, and no redirect to
            // a login page — a caller without a certificate should not learn
            // what lives here.
            return new NextResponse(
                JSON.stringify({ error: 'Forbidden' }),
                { status: 403, headers: { 'Content-Type': 'application/json' } },
            );
        }
    }

    // ── Block GET /api/auth/csrf ──
    // NextAuth exposes a CSRF token via GET. This is only needed internally
    // by the NextAuth client. Block unauthenticated direct access to prevent
    // token harvesting for CSRF attacks.
    if (pathname === '/api/auth/csrf') {
        const origin = request.headers.get('origin');
        const referer = request.headers.get('referer');
        const secFetchSite = request.headers.get('sec-fetch-site');

        // Allow same-origin requests (from our own frontend pages)
        const isSameOrigin = secFetchSite === 'same-origin'
            || (origin && ALLOWED_ORIGINS.has(origin))
            || (referer && (() => {
                try { return ALLOWED_ORIGINS.has(new URL(referer).origin); }
                catch { return false; }
            })());

        if (!isSameOrigin) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 },
            );
        }
    }

    // ── CSRF Origin Validation for all API POST/PUT/PATCH/DELETE ──
    // Internal cron endpoints are server-to-server (no Origin header) and are
    // authenticated by their own secret header (x-*-cron-secret), so they're
    // exempt from the browser-oriented CSRF origin check — otherwise they 403.
    const csrfExempt = pathname === '/api/billing/cycle'
        || pathname === '/api/monitoring/sweep'
        || pathname === '/api/internal/provision/step'
        || pathname === '/api/internal/provision/sweep'
        || pathname === '/api/internal/mail/unrouted';
    if (pathname.startsWith('/api/') && !csrfExempt && !validateCsrfOrigin(request)) {
        return NextResponse.json(
            { error: 'CSRF validation failed: invalid origin' },
            { status: 403 },
        );
    }

    const response = NextResponse.next();

    // ── Apply Security Headers ──
    Object.entries(securityHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Pass pathname so the root layout can conditionally hide Navbar/Footer
    response.headers.set('x-pathname', pathname);

    const token = getSessionToken(request);

    // ── Authenticated Root Redirect ──
    // Logged-in users visiting "/" are forwarded to the Console overview,
    // mirroring GCP behavior where the dashboard is the default view.
    if (pathname === '/' && token) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // ── Protect Dashboard & Console-Window Routes ──
    const isAuthRoute = pathname.startsWith('/dashboard')
        || pathname.startsWith('/admin')
        || pathname.startsWith('/console-window')
        || pathname.startsWith('/account-settings');

    if (isAuthRoute && !token) {
        const loginUrl = new URL('/auth/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return response;
}

export const config = {
    matcher: [
        // Include api/auth routes in the matcher now (for CSRF protection)
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
