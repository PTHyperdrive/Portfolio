import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/user/sessions
 *
 * Returns all active DeviceSessions for the authenticated user,
 * ordered most-recently-active first.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const sessions = await prisma.deviceSession.findMany({
            where: { userId: session.user.id },
            orderBy: { lastActive: "desc" },
        });

        return NextResponse.json({ sessions });
    } catch (error) {
        console.error("[sessions] GET error:", error);
        return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
    }
}
