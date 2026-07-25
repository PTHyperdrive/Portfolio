import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export type ApiGuardResult =
    | { userId: string; error: null }
    | { userId: null; error: NextResponse };

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
    const session = await auth();

    if (!session?.user?.id) {
        return {
            userId: null,
            error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });
    if (user?.role !== "ADMIN") {
        return {
            userId: null,
            error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
        };
    }

    return { userId: session.user.id, error: null };
}
