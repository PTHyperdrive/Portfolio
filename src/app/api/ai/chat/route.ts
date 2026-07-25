import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { resolveNodeForUser, decryptNodeKey } from "@/lib/ai-nodes";
import { audit } from "@/lib/audit";

/**
 * POST /api/ai/chat
 *
 * Streams a completion from an LM Studio host back to the browser as SSE.
 *
 * The upstream host is never exposed to the client: the browser sends a
 * conversation id and a nodeId, and this route decides which LAN address
 * (if any) it is allowed to reach. A user asking for a PREMIUM node is
 * refused and audited rather than downgraded.
 *
 * Emitted events:
 *   meta  {model, gpuLabel, messageId}  — once, before the first token
 *   delta {text}                        — per token chunk
 *   done  {latencyMs, outputTokens}     — once, after persistence
 *   error {message}                     — terminal
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
    conversationId: z.string().min(1).max(64),
    content: z.string().trim().min(1).max(32_000),
    nodeId: z.string().min(1).max(64).nullable().optional(),
});

/** Rough char budget from a token context window, leaving room for the reply. */
function historyCharBudget(contextLen: number): number {
    return Math.max(2000, (contextLen - 1024) * 3);
}

function sseEvent(event: string, data: unknown): Uint8Array {
    return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { conversationId, content, nodeId } = parsed.data;

    // ── Ownership ────────────────────────────────────────────────
    const conversation = await prisma.aiConversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true, nodeId: true, title: true },
    });
    if (!conversation) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // ── Tier gate ────────────────────────────────────────────────
    const requestedNode = nodeId ?? conversation.nodeId ?? null;
    const { node, error: nodeErr } = await resolveNodeForUser(userId, requestedNode);

    if (nodeErr === "FORBIDDEN") {
        void audit({
            userId,
            action: "AI_TIER_DENIED",
            resourceType: "AiNode",
            resourceId: requestedNode ?? undefined,
            outcome: "DENIED",
            req,
        });
        return NextResponse.json(
            { error: "This model runs on hardware reserved for administrators." },
            { status: 403 },
        );
    }
    if (nodeErr || !node) {
        return NextResponse.json(
            { error: "No inference node is available right now." },
            { status: 503 },
        );
    }

    // ── Persist the user turn, then build the prompt ─────────────
    const priorCount = await prisma.aiMessage.count({ where: { conversationId } });

    await prisma.aiMessage.create({
        data: { conversationId, role: "user", content },
    });

    // First turn names the thread.
    const autoTitle =
        priorCount === 0 && conversation.title === "New chat"
            ? content.replace(/\s+/g, " ").slice(0, 80)
            : null;

    await prisma.aiConversation.update({
        where: { id: conversationId },
        data: {
            nodeId: node.id,
            ...(autoTitle ? { title: autoTitle } : {}),
        },
    });

    // Newest-first fetch, then trim to the context budget and re-sort.
    const recent = await prisma.aiMessage.findMany({
        where: { conversationId, failed: false },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: { role: true, content: true },
    });

    const budget = historyCharBudget(node.contextLen);
    const history: { role: string; content: string }[] = [];
    let used = 0;
    for (const msg of recent) {
        used += msg.content.length;
        if (used > budget && history.length > 0) break;
        history.push(msg);
    }
    history.reverse();

    // ── Call the LM Studio host ──────────────────────────────────
    const apiKey = decryptNodeKey(node.apiKey);
    const upstream = `${node.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const startedAt = Date.now();

    let res: Response;
    try {
        res = await fetch(upstream, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify({
                model: node.modelId,
                messages: history,
                max_tokens: node.maxTokens,
                stream: true,
                stream_options: { include_usage: true },
            }),
            signal: req.signal,
        });
    } catch (err) {
        console.error(`[api/ai/chat] ${node.name} unreachable:`, err);
        await prisma.aiNode.update({
            where: { id: node.id },
            data: {
                online: false,
                lastError: err instanceof Error ? err.message : "unreachable",
                lastCheckAt: new Date(),
            },
        });
        return NextResponse.json(
            { error: `${node.displayName} is not responding.` },
            { status: 503 },
        );
    }

    if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        console.error(`[api/ai/chat] ${node.name} HTTP ${res.status}: ${detail.slice(0, 500)}`);
        return NextResponse.json(
            { error: `Inference failed on ${node.displayName} (HTTP ${res.status}).` },
            { status: 502 },
        );
    }

    // ── Re-emit upstream SSE as our own event stream ─────────────
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let answer = "";
            let reasoning = "";
            let outputTokens: number | null = null;
            let promptTokens: number | null = null;
            let reasoningTokens: number | null = null;

            const assistant = await prisma.aiMessage.create({
                data: {
                    conversationId,
                    role: "assistant",
                    content: "",
                    modelId: node.modelId,
                    gpuLabel: node.gpuLabel,
                },
                select: { id: true },
            });

            controller.enqueue(sseEvent("meta", {
                messageId: assistant.id,
                model: node.displayName,
                gpuLabel: node.gpuLabel,
                tier: node.tier,
            }));

            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith("data:")) continue;

                        const payload = trimmed.slice(5).trim();
                        if (payload === "[DONE]") continue;

                        try {
                            const chunk = JSON.parse(payload);
                            const delta = chunk.choices?.[0]?.delta;

                            // Reasoning models (Gemma 4 QAT, DeepSeek-R1, gpt-oss)
                            // stream their scratchpad on a separate field first.
                            // Forward it so the UI can show progress instead of an
                            // empty bubble, but keep it out of the stored answer.
                            const think: string =
                                delta?.reasoning_content ?? delta?.reasoning ?? "";
                            if (think) {
                                reasoning += think;
                                controller.enqueue(sseEvent("reasoning", { text: think }));
                            }

                            const text: string = delta?.content ?? "";
                            if (text) {
                                answer += text;
                                controller.enqueue(sseEvent("delta", { text }));
                            }

                            if (chunk.usage) {
                                outputTokens = chunk.usage.completion_tokens ?? null;
                                promptTokens = chunk.usage.prompt_tokens ?? null;
                                reasoningTokens =
                                    chunk.usage.completion_tokens_details?.reasoning_tokens ?? null;
                            }
                        } catch {
                            // Partial JSON across chunk boundaries — skip this line.
                        }
                    }
                }

                const latencyMs = Date.now() - startedAt;

                // A reasoning model can spend its entire max_tokens budget on the
                // scratchpad and emit no answer at all. That is not a silent empty
                // reply — tell the user what happened and what to change.
                const exhaustedByReasoning = answer.length === 0 && reasoning.length > 0;

                await prisma.aiMessage.update({
                    where: { id: assistant.id },
                    data: {
                        content: answer,
                        latencyMs,
                        outputTokens,
                        promptTokens,
                        failed: answer.length === 0,
                    },
                });
                await prisma.aiConversation.update({
                    where: { id: conversationId },
                    data: { updatedAt: new Date() },
                });

                void audit({
                    userId,
                    action: "AI_CHAT_COMPLETION",
                    resourceType: "AiNode",
                    resourceId: node.id,
                    metadata: {
                        conversationId,
                        model: node.modelId,
                        gpu: node.gpuLabel,
                        tier: node.tier,
                        outputTokens,
                        reasoningTokens,
                        latencyMs,
                    },
                });

                if (exhaustedByReasoning) {
                    controller.enqueue(sseEvent("error", {
                        message:
                            `${node.displayName} used its entire ${node.maxTokens}-token budget ` +
                            `reasoning and produced no answer. Raise "Max output tokens" for this ` +
                            `node, or ask a narrower question.`,
                    }));
                } else {
                    controller.enqueue(sseEvent("done", { latencyMs, outputTokens, reasoningTokens }));
                }
            } catch (err) {
                // Client disconnects land here; keep whatever was generated.
                const message = err instanceof Error ? err.message : "Stream interrupted";
                console.error(`[api/ai/chat] stream aborted on ${node.name}:`, message);

                await prisma.aiMessage.update({
                    where: { id: assistant.id },
                    data: { content: answer, failed: answer.length === 0 },
                }).catch(() => { /* row may be gone if the thread was deleted mid-stream */ });

                controller.enqueue(sseEvent("error", { message }));
            } finally {
                reader.releaseLock();
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
