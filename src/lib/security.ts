import bcrypt from 'bcryptjs';

// ─── Input Sanitization ────────────────────────────────────────

/**
 * Sanitize user input by encoding HTML entities to prevent XSS.
 * React already escapes by default, but this adds a server-side layer.
 */
export function sanitizeInput(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Strip all HTML tags from input
 */
export function stripHtml(input: string): string {
    return input.replace(/<[^>]*>/g, '');
}

// ─── Password Hashing ──────────────────────────────────────────

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
    password: string,
    hashedPassword: string
): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
}

// ─── Rate Limiting ──────────────────────────────────────────────

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetAt < now) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Token bucket rate limiter
 * @param key - Unique identifier (e.g., IP address)
 * @param maxAttempts - Maximum attempts per window
 * @param windowMs - Time window in milliseconds
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(
    key: string,
    maxAttempts: number = 5,
    windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt < now) {
        rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxAttempts - 1, resetIn: windowMs };
    }

    if (entry.count >= maxAttempts) {
        return {
            allowed: false,
            remaining: 0,
            resetIn: entry.resetAt - now,
        };
    }

    entry.count++;
    return {
        allowed: true,
        remaining: maxAttempts - entry.count,
        resetIn: entry.resetAt - now,
    };
}

// ─── Security Headers ───────────────────────────────────────────

export const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
    ].join('; '),
};
