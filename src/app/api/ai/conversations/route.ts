import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { resolveNodeForUser } from "@/lib/ai-nodes";

const createSchema = z.object({
    nodeId: z.string().min(1).max(64).nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    kind: z.enum(["STUDIO", "SUPPORT"]).optional(),
});

/**
 * GET /api/ai/conversations
 * The caller's chat threads, most recently used first.
 * Defaults to STUDIO threads so support chats don't pollute the Studio
 * sidebar; the support widget asks for its own with ?kind=SUPPORT.
 */
export async function GET(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const kindParam = new URL(req.url).searchParams.get("kind");
    const kind = kindParam === "SUPPORT" ? "SUPPORT" as const : "STUDIO" as const;

    const conversations = await prisma.aiConversation.findMany({
        where: { userId, kind },
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

    const { nodeId = null, title, kind = "STUDIO" } = parsed.data;

    // Support chat is opt-in: the thread cannot exist before consent, so the
    // gate lives here rather than only in the widget UI.
    if (kind === "SUPPORT") {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { supportChatConsentAt: true },
        });
        if (!user?.supportChatConsentAt) {
            return NextResponse.json(
                { error: "Support chat requires consent first" },
                { status: 403 },
            );
        }
    }

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
        data: {
            userId,
            // A support thread never pins a node — the chat route resolves the
            // default STANDARD node on every turn.
            nodeId: kind === "SUPPORT" ? null : nodeId,
            kind,
            title: title ?? (kind === "SUPPORT" ? "Support chat" : "New chat"),
        },
        select: { id: true, title: true, nodeId: true, kind: true, updatedAt: true },
    });

    return NextResponse.json({ conversation }, { status: 201 });
}
