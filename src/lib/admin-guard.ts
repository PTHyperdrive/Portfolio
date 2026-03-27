import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * requireAdmin()
 *
 * Call at the top of every admin API route handler.
 * Returns { userId, error } where `error` is a ready-to-return NextResponse
 * if the caller is not authenticated or not an ADMIN, or null if access is granted.
 *
 * Usage:
 *   const { userId, error } = await requireAdmin();
 *   if (error) return error;
 */
export async function requireAdmin(): Promise<
    { userId: string; error: null } | { userId: null; error: NextResponse }
> {
    const session = await auth();

    if (!session?.user?.id) {
        return {
            userId: null,
            error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }

    const role = (session.user as { role?: string }).role;
    if (role !== "ADMIN") {
        return {
            userId: null,
            error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
        };
    }

    return { userId: session.user.id, error: null };
}
