import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { resolveNodeForUser, decryptNodeKey } from "@/lib/ai-nodes";
import { searchKnowledge, formatContext } from "@/lib/ai-knowledge";
import { systemPrompt, supportSystemPrompt, visibilitiesForMode, frameUntrusted } from "@/lib/ai-security";
import { audit } from "@/lib/audit";

/** A turn as sent upstream. Content is a string, or parts when images ride along. */
type ChatPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };
type ChatTurn = { role: string; content: string | ChatPart[] };

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
    /** Forward the model's scratchpad to the client. Applied on our side. */
    showReasoning: z.boolean().optional(),
    /** Only reaches the runtime on nodes flagged reasoningControl. */
    reasoningEffort: z.enum(["off", "low", "medium", "high"]).optional(),
    /**
     * Inline images as data URLs. Restricted to still raster formats the
     * vision encoder accepts — no SVG, which is script-bearing markup rather
     * than an image, and no arbitrary URLs, which would make this an SSRF
     * primitive pointed at the LAN.
     */
    images: z.array(
        z.string()
            .regex(/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/, "Unsupported image format")
            .max(12_000_000),
    ).max(4).optional(),
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
    const { conversationId, content, nodeId, showReasoning, reasoningEffort, images } = parsed.data;

    // ── Ownership ────────────────────────────────────────────────
    const conversation = await prisma.aiConversation.findFirst({
        where: { id: conversationId, userId },
        select: {
            id: true, nodeId: true, title: true, kind: true,
            showReasoning: true, reasoningEffort: true,
        },
    });
    if (!conversation) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // The kind is read from the row, never from the request — a client cannot
    // flip a SUPPORT thread into STUDIO privileges by sending a flag.
    const isSupport = conversation.kind === "SUPPORT";

    // ── Tier gate ────────────────────────────────────────────────
    // Support threads always run on the default STANDARD node: the widget
    // offers no model picker, and a premium node request from that surface
    // would be a smuggled parameter, not a feature.
    const requestedNode = isSupport ? null : (nodeId ?? conversation.nodeId ?? null);
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

    // Images are not persisted — only the fact that some were attached, so a
    // later turn reads coherently without storing megabytes of base64.
    // Must match the client's optimistic suffix exactly, or the message text
    // changes under the user when the thread is reloaded from the server.
    const imageNote = images?.length ? `\n\n[attached ${images.length} image(s)]` : "";

    await prisma.aiMessage.create({
        data: { conversationId, role: "user", content: content + imageNote },
    });

    // First turn names the thread.
    const autoTitle =
        priorCount === 0 && conversation.title === "New chat"
            ? content.replace(/\s+/g, " ").slice(0, 80)
            : null;

    // Per-request options become the thread's preference so a reload keeps them.
    const wantReasoning = showReasoning ?? conversation.showReasoning;
    const effort = reasoningEffort ?? conversation.reasoningEffort ?? undefined;

    await prisma.aiConversation.update({
        where: { id: conversationId },
        data: {
            nodeId: node.id,
            ...(autoTitle ? { title: autoTitle } : {}),
            ...(showReasoning !== undefined ? { showReasoning } : {}),
            ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
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
    const history: ChatTurn[] = [];
    let used = 0;
    for (const msg of recent) {
        used += msg.content.length;
        if (used > budget && history.length > 0) break;
        history.push({ role: msg.role, content: msg.content });
    }
    history.reverse();

    // ── Ground the answer in the operator's own documentation ────
    // Retrieval is visibility-scoped by role inside searchKnowledge, so a
    // tenant's question never pulls operator-only passages.
    const role = (await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    }))?.role ?? "USER";

    let retrieved: Awaited<ReturnType<typeof searchKnowledge>> = [];
    try {
        // Support threads retrieve PUBLIC documents only, whatever the role —
        // the transcript is a customer-facing surface (C4, support variant).
        retrieved = await searchKnowledge(
            content, role, undefined,
            visibilitiesForMode(conversation.kind, role),
        );
    } catch (err) {
        // Retrieval is an enhancement — never fail the chat over it.
        console.error("[api/ai/chat] retrieval failed:", err);
    }

    if (retrieved.length > 0) {
        void audit({
            userId,
            action: "AI_KNOWLEDGE_SEARCH",
            resourceType: "AiConversation",
            resourceId: conversationId,
            metadata: { hits: retrieved.length, docs: retrieved.map(r => r.docSlug) },
        });
    }

    const prompt: ChatTurn[] = [
        {
            role: "system",
            content: isSupport
                ? supportSystemPrompt()
                : systemPrompt({ role, tier: node.tier, hasKnowledge: retrieved.length > 0 }),
        },
        ...(retrieved.length > 0
            ? [{ role: "system" as const, content: frameUntrusted("knowledge_base", formatContext(retrieved)) }]
            : []),
        ...history,
    ];

    // Attach images to the final user turn. Only the current turn carries
    // them; prior images are not replayed, which keeps context bounded.
    if (images?.length) {
        for (let i = prompt.length - 1; i >= 0; i--) {
            if (prompt[i].role === "user") {
                prompt[i] = {
                    role: "user",
                    content: [
                        { type: "text", text: content },
                        ...images.map(url => ({ type: "image_url" as const, image_url: { url } })),
                    ],
                };
                break;
            }
        }
    }

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
                messages: prompt,
                max_tokens: node.maxTokens,
                stream: true,
                stream_options: { include_usage: true },
                // Sent only where it is known to work. Measured against
                // gemma-4-26b-a4b-qat, LM Studio ignores both this and
                // chat_template_kwargs.enable_thinking, so nodes default to
                // reasoningControl=false and we do not pretend otherwise.
                ...(node.reasoningControl && effort && effort !== "off"
                    ? { reasoning_effort: effort }
                    : {}),
                ...(node.reasoningControl && effort === "off"
                    ? { chat_template_kwargs: { enable_thinking: false } }
                    : {}),
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
                                // Always accumulated — the exhausted-budget check
                                // below needs it even when the user hides it.
                                reasoning += think;
                                // Emit either way so the UI can show "Thinking…"
                                // instead of an idle bubble; the text itself is
                                // withheld when the user has it collapsed.
                                controller.enqueue(sseEvent("reasoning", {
                                    ...(wantReasoning ? { text: think } : {}),
                                    chars: reasoning.length,
                                }));
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
