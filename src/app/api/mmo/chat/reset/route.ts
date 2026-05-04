import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * DELETE /api/mmo/chat/reset
 * User resets their own chat PIN.
 * - Deletes all messages in the user's own chat thread
 * - Marks the thread as `closed` (admin sees it as archived)
 * - User can start a fresh thread by re-initialising via /api/mmo/chat (POST)
 *
 * Requires { confirm: "RESET_PIN" } in the body.
 */
export async function DELETE(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id)
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        if (body?.confirm !== "RESET_PIN")
            return NextResponse.json({ error: "Confirmation required" }, { status: 400 });

        // Find the user's chat thread
        const chat = await prisma.supportChat.findUnique({
            where: { userId: session.user.id },
            select: { id: true },
        });

        if (!chat)
            return NextResponse.json({ error: "No active chat found" }, { status: 404 });

        // Delete all messages in this thread, then close it
        const [{ count }] = await Promise.all([
            prisma.supportMessage.deleteMany({ where: { chatId: chat.id } }),
            prisma.supportChat.update({ where: { id: chat.id }, data: { closed: true } }),
        ]);

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId: session.user.id,
                action: "USER_CHAT_PIN_RESET",
                resourceType: "SupportChat",
                outcome: "SUCCESS",
            },
        }).catch(() => { /* non-fatal */ });

        return NextResponse.json({ deleted: count, closed: true });
    } catch (err) {
        console.error("[DELETE /api/mmo/chat/reset]", err);
        return NextResponse.json({ error: "Failed to reset chat" }, { status: 500 });
    }
}
