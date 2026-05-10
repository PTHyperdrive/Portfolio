import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { securityHeaders } from '@/lib/security';

/** Check for an active session token (works in both dev and prod). */
function getSessionToken(request: NextRequest): string | undefined {
    return request.cookies.get('authjs.session-token')?.value
        || request.cookies.get('__Secure-authjs.session-token')?.value;
}

export function middleware(request: NextRequest) {
    const response = NextResponse.next();

    // ── Apply Security Headers ──
    Object.entries(securityHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Pass pathname so the root layout can conditionally hide Navbar/Footer
    const { pathname } = request.nextUrl;
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
        '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
    ],
};
