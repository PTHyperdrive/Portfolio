import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { securityHeaders } from '@/lib/security';

export function middleware(request: NextRequest) {
    const response = NextResponse.next();

    // ── Apply Security Headers ──
    Object.entries(securityHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Pass pathname so the root layout can conditionally hide Navbar/Footer
    const { pathname } = request.nextUrl;
    response.headers.set('x-pathname', pathname);

    // ── Protect Dashboard & Console-Window Routes ──
    const isAuthRoute = pathname.startsWith('/dashboard')
        || pathname.startsWith('/admin')
        || pathname.startsWith('/console-window');

    if (isAuthRoute) {
        const token = request.cookies.get('authjs.session-token')?.value
            || request.cookies.get('__Secure-authjs.session-token')?.value;

        if (!token) {
            const loginUrl = new URL('/auth/login', request.url);
            loginUrl.searchParams.set('callbackUrl', pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    return response;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
    ],
};
