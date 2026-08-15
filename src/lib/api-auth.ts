import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { resolveVaultToken } from "@/lib/vault-auth";

export type ApiGuardResult =
    | { userId: string; error: null }
    | { userId: null; error: NextResponse };

/**
 * Identify a caller holding a vault bearer token instead of a session.
 *
 * The vault page deliberately stores nothing — no cookie, no localStorage — so
 * its requests carry an Authorization header instead. Reading it through
 * `headers()` rather than a parameter means every existing route gains this
 * without a single call site changing.
 *
 * Returns null when there is no token, which leaves the normal session path
 * untouched.
 */
async function vaultCaller(): Promise<string | null> {
    try {
        const header = (await headers()).get("authorization") || "";
        if (!header.startsWith("Bearer ")) return null;
        return resolveVaultToken(header.slice(7).trim());
    } catch {
        // headers() throws outside a request scope; treat as "no token".
        return null;
    }
}

/**
 * requireUser()
 *
 * Call at the top of every authenticated API route handler.
 * Returns { userId, error } where `error` is a ready-to-return NextResponse
 * if the caller is not authenticated, or null if access is granted.
 *
 * Usage:
 *   const { userId, error } = await requireUser();
 *   if (error) return error;
 */
export async function requireUser(): Promise<ApiGuardResult> {
    // A vault token stands in for a session; it was minted only after a TOTP
    // challenge, so it is no weaker a proof of identity.
    const vaultUser = await vaultCaller();
    if (vaultUser) return { userId: vaultUser, error: null };

    const session = await auth();

    if (!session?.user?.id) {
        return {
            userId: null,
            error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }

    return { userId: session.user.id, error: null };
}

/**
 * requireAdmin()
 *
 * Call at the top of every admin API route handler.
 * Verifies the role against the database so a revoked admin loses access
 * immediately rather than at the next session refresh.
 *
 * Usage:
 *   const { userId, error } = await requireAdmin();
 *   if (error) return error;
 */
export async function requireAdmin(): Promise<ApiGuardResult> {
    // The vault only ever issues tokens for the configured admin, but the role
    // is still read from the database below rather than assumed — a demoted
    // account must lose admin routes even while holding a live vault token.
    const vaultUser = await vaultCaller();
    const session = vaultUser ? null : await auth();
    const callerId = vaultUser ?? session?.user?.id;

    if (!callerId) {
        return {
            userId: null,
            error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }

    const user = await prisma.user.findUnique({
        where: { id: callerId },
        select: { role: true },
    });
    if (user?.role !== "ADMIN") {
        return {
            userId: null,
            error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
        };
    }

    return { userId: callerId, error: null };
}
