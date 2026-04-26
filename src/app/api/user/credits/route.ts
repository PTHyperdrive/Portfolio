import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/user/credits — Returns the authenticated user's current credit balance.
 * Used by the global CreditProvider to keep the UI in sync.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { credits: true },
        });

        return NextResponse.json({ credits: user?.credits ?? 0 });
    } catch (err) {
        console.error("[GET /api/user/credits]", err);
        return NextResponse.json({ error: "Failed to fetch credits" }, { status: 500 });
    }
}
