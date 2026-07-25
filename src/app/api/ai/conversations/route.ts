import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { resolveNodeForUser } from "@/lib/ai-nodes";

const createSchema = z.object({
    nodeId: z.string().min(1).max(64).nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
});

/**
 * GET /api/ai/conversations
 * The caller's chat threads, most recently used first.
 */
export async function GET() {
    const { userId, error } = await requireUser();
    if (error) return error;

    const conversations = await prisma.aiConversation.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
            id: true,
            title: true,
            nodeId: true,
            updatedAt: true,
            _count: { select: { messages: true } },
        },
    });

    return NextResponse.json({
        conversations: conversations.map(c => ({
            id: c.id,
            title: c.title,
            nodeId: c.nodeId,
            updatedAt: c.updatedAt,
            messageCount: c._count.messages,
        })),
    });
}

/**
 * POST /api/ai/conversations
 * Open a new thread. A nodeId the caller may not use is rejected here
 * rather than silently downgraded, so the UI cannot mislead about which
 * GPU answered.
 */
export async function POST(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { nodeId = null, title } = parsed.data;

    if (nodeId) {
        const { error: nodeErr } = await resolveNodeForUser(userId, nodeId);
        if (nodeErr === "FORBIDDEN") {
            return NextResponse.json(
                { error: "This model is restricted to administrators" },
                { status: 403 },
            );
        }
        if (nodeErr) {
            return NextResponse.json({ error: "Inference node unavailable" }, { status: 404 });
        }
    }

    const conversation = await prisma.aiConversation.create({
        data: { userId, nodeId, title: title ?? "New chat" },
        select: { id: true, title: true, nodeId: true, updatedAt: true },
    });

    return NextResponse.json({ conversation }, { status: 201 });
}
