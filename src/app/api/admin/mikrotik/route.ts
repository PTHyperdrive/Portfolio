import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { collectHealthSnapshot } from "@/lib/mikrotik";

/**
 * GET /api/admin/mikrotik — One-shot MikroTik health snapshot.
 * Admin-only. Used for initial page load before SSE connects.
 */
export async function GET() {
    try {
        const session = await auth();
        const role = (session?.user as Record<string, unknown>)?.role;
        if (!session?.user?.id || role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const snapshot = await collectHealthSnapshot();
        return NextResponse.json(snapshot);
    } catch (error) {
        console.error("[mikrotik] Health check error:", error);
        return NextResponse.json(
            { error: "Failed to check MikroTik health" },
            { status: 500 }
        );
    }
}
