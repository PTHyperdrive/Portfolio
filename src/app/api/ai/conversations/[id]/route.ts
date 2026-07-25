import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { resolveNodeForUser } from "@/lib/ai-nodes";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    nodeId: z.string().min(1).max(64).nullable().optional(),
});

/** Ownership check — a thread is only ever visible to the user who opened it. */
async function ownedBy(conversationId: string, userId: string) {
    return prisma.aiConversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
    });
}

/** GET /api/ai/conversations/[id] — full transcript. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const { id } = await params;

    const conversation = await prisma.aiConversation.findFirst({
        where: { id, userId },
        select: {
            id: true,
            title: true,
            nodeId: true,
            updatedAt: true,
            messages: {
                orderBy: { createdAt: "asc" },
                select: {
                    id: true, role: true, content: true, modelId: true,
                    gpuLabel: true, latencyMs: true, outputTokens: true,
                    failed: true, createdAt: true,
                },
            },
        },
    });

    if (!conversation) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ conversation });
}

/** PATCH /api/ai/conversations/[id] — rename, or switch the backing model. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const { id } = await params;
    if (!(await ownedBy(id, userId))) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { title, nodeId } = parsed.data;

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

    const conversation = await prisma.aiConversation.update({
        where: { id },
        data: {
            ...(title !== undefined ? { title } : {}),
            ...(nodeId !== undefined ? { nodeId } : {}),
        },
        select: { id: true, title: true, nodeId: true, updatedAt: true },
    });

    return NextResponse.json({ conversation });
}

/** DELETE /api/ai/conversations/[id] — messages cascade. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const { id } = await params;
    if (!(await ownedBy(id, userId))) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    await prisma.aiConversation.delete({ where: { id } });

    void audit({
        userId,
        action: "AI_CONVERSATION_DELETE",
        resourceType: "AiConversation",
        resourceId: id,
        req,
    });

    return NextResponse.json({ ok: true });
}
