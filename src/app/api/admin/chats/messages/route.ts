import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * DELETE /api/admin/chats/messages
 * Wipes all SupportChatMessage rows across every thread.
 * Used when the admin resets their decryption PIN — since old ciphertexts
 * cannot be decrypted with the new PIN, they must be purged.
 * Admin-only. Requires confirmation payload { confirm: "RESET_PIN" }.
 */
export async function DELETE(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id)
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({
            where: { id: session.user.id }, select: { role: true },
        });
        if (user?.role !== "ADMIN")
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const body = await req.json().catch(() => ({}));
        if (body?.confirm !== "RESET_PIN")
            return NextResponse.json({ error: "Confirmation required" }, { status: 400 });

        // Delete all messages — threads survive (users can start fresh)
        const { count } = await prisma.supportMessage.deleteMany({});

        // Audit the destructive action
        await prisma.auditLog.create({
            data: {
                userId: session.user.id,
                action: "ADMIN_PIN_RESET",
                resourceType: "SupportChat",
                outcome: "SUCCESS",
            },
        }).catch(() => { /* non-fatal */ });

        return NextResponse.json({ deleted: count });
    } catch (err) {
        console.error("[DELETE /api/admin/chats/messages]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
