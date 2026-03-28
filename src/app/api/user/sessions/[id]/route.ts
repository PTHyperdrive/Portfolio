import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * DELETE /api/user/sessions/[id]
 *
 * Revokes a specific DeviceSession. Verifies ownership before deletion
 * to prevent users from revoking other users' sessions.
 */
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Verify the session exists and belongs to this user
        const deviceSession = await prisma.deviceSession.findUnique({
            where: { id },
            select: { userId: true },
        });

        if (!deviceSession) {
            return NextResponse.json({ error: "Session not found" }, { status: 404 });
        }

        if (deviceSession.userId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await prisma.deviceSession.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[sessions] DELETE error:", error);
        return NextResponse.json({ error: "Failed to revoke session" }, { status: 500 });
    }
}
