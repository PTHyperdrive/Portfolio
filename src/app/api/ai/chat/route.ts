import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { resolveNodeForUser } from "@/lib/ai-nodes";
import { searchKnowledge, formatContext } from "@/lib/ai-knowledge";
import { systemPrompt, supportSystemPrompt, visibilitiesForMode, frameUntrusted } from "@/lib/ai-security";
import { adapterFor, multiModelPreamble, vendorFor } from "@/lib/ai-providers";
import type { ChatTurn, ChatImage, ChatDocument } from "@/lib/ai-providers";
import { composeSkills, renderSkills } from "@/lib/ai-skills";
import { renderFileBlock, attachmentNote, MAX_FILES } from "@/lib/ai-files";
import type { IngestedFile } from "@/lib/ai-files";
import { audit } from "@/lib/audit";

/**
 * POST /api/ai/chat
 *
 * Streams a completion back to the browser as SSE, from whichever provider the
 * chosen node names — a local LM Studio host, Claude, or Gemini. The route
 * itself is provider-agnostic: it assembles a normalised request and hands it
 * to `adapterFor(node.provider)`.
 *
 * ── One conversation, several models ───────────────────────────────
 *
 * Every assistant turn is persisted with the provider and model that wrote it.
 * On the next turn `buildTranscript()` replays the thread for whichever model
 * is answering now: its own turns as first-person assistant turns, everyone
 * else's as attributed text. So the local model sees what Claude said, Claude
 * sees what the local model said, and neither mistakes the other's words for
 * its own. Retrieval and skills compose once, before that split, which is what
 * makes the shared knowledge actually shared.
 *
 * The upstream host is never exposed to the client: the browser sends a
 * conversation id and a nodeId, and this route decides which endpoint (if any)
 * it is allowed to reach. A user asking for a PREMIUM node is refused and
 * audited rather than downgraded.
 *
 * Emitted events:
 *   meta      {messageId, model, gpuLabel, tier, provider}  — before first token
 *   reasoning {text?, chars}                                 — scratchpad
 *   delta     {text}                                         — answer tokens
 *   tool      {name, detail?}                                — provider-side tool run
 *   done      {latencyMs, outputTokens}                      — after persistence
 *   error     {message}                                      — terminal
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
    conversationId: z.string().min(1).max(64),
    content: z.string().trim().min(1).max(32_000),
    nodeId: z.string().min(1).max(64).nullable().optional(),
    /**
     * Model to run on that node. Constrained in shape only — the provider is
     * the authority on what it actually serves, and reports a bad id far more
     * precisely than a guess here could.
     */
    modelId: z.string().trim().min(1).max(160).regex(/^[\w./:-]+$/).nullable().optional(),
    /** Forward the model's scratchpad to the client. Applied on our side. */
    showReasoning: z.boolean().optional(),
    /** Mapped per provider; ignored by local nodes without reasoningControl. */
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
    /**
     * Files already ingested by POST /api/ai/files. Re-posting the extracted
     * text rather than a handle keeps this route stateless, and the text has
     * been through the same validation either way — it is framed as untrusted
     * data below regardless of what the client claims about it.
     */
    files: z.array(
        z.object({
            filename: z.string().min(1).max(200),
            mediaType: z.string().min(1).max(100),
            bytes: z.number().int().nonnegative(),
            text: z.string().max(2_000_000).optional(),
            data: z.string().max(14_000_000).optional(),
        }),
    ).max(MAX_FILES).optional(),
});

/** Rough char budget from a token context window, leaving room for the reply. */
function historyCharBudget(contextLen: number): number {
    return Math.max(2000, (contextLen - 1024) * 3);
}

function sseEvent(event: string, data: unknown): Uint8Array {
    return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Split a data: URL into the parts the provider adapters want. */
function parseDataUrl(url: string): ChatImage | null {
    const match = /^data:([^;]+);base64,(.+)$/.exec(url);
    return match ? { mediaType: match[1], data: match[2] } : null;
}

/** True when the runtime refused to load the model rather than failing to answer. */
function isModelLoadFailure(err: unknown): boolean {
    return err instanceof Error && /failed to load model/i.test(err.message);
}

/**
 * Turn whatever went wrong into a sentence worth showing.
 *
 * Two failures here reached the browser as a blank assistant bubble. One was an
 * error carrying an empty message — the panel rendered "" and the log said
 * `failed:` with nothing after it. The other was an upstream 400 whose body was
 * raw OpenAI error JSON, pasted into the UI braces and all.
 *
 * So: never return an empty string, and unwrap the provider's JSON to the one
 * sentence inside it that says what to do.
 */
function describeChatFailure(err: unknown, nodeName: string): string {
    const raw = err instanceof Error ? err.message : String(err ?? "");

    // Upstream bodies arrive appended to our own text; find the JSON in them.
    const brace = raw.indexOf("{");
    if (brace !== -1) {
        try {
            const body = JSON.parse(raw.slice(brace));
            const inner = body?.error?.message ?? body?.message;
            if (typeof inner === "string" && inner) {
                return /failed to load model/i.test(inner)
                    ? `${inner} This usually means the model does not fit in the GPU memory ` +
                      `available on ${nodeName}. Pick a smaller model, or unload another one first.`
                    : inner;
            }
        } catch { /* not JSON after all — fall through */ }
    }

    if (raw.trim()) return raw;

    // Empty message: say what is actually known rather than showing nothing.
    if (err instanceof Error && err.name === "AbortError") {
        return "The request was cancelled before the model replied.";
    }
    return `${nodeName} closed the connection without answering. ` +
        `It may have run out of memory loading the model, or been restarted mid-request.`;
}

export async function POST(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const {
        conversationId, content, nodeId, modelId, showReasoning, reasoningEffort, images, files,
    } = parsed.data;

    // ── Ownership ────────────────────────────────────────────────
    const conversation = await prisma.aiConversation.findFirst({
        where: { id: conversationId, userId },
        select: {
            id: true, nodeId: true, modelId: true, title: true, kind: true,
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

    const adapter = adapterFor(node.provider);

    // ── Sort attachments by what this provider can actually take ──
    const ingested: IngestedFile[] = files ?? [];
    const textFiles = ingested.filter(f => typeof f.text === "string");
    const documents: ChatDocument[] = [];
    const unsupported: string[] = [];

    for (const f of ingested) {
        if (typeof f.text === "string" || !f.data) continue;
        if (adapter.nativeDocuments) {
            documents.push({ filename: f.filename, mediaType: f.mediaType, data: f.data });
        } else {
            unsupported.push(f.filename);
        }
    }

    // Refuse rather than answer around a file the model never saw. A reply that
    // ignores the PDF the question was about is worse than a clear error.
    if (unsupported.length > 0) {
        return NextResponse.json(
            {
                error:
                    `${node.displayName} cannot read PDFs directly (${unsupported.join(", ")}). ` +
                    `Switch to a Claude or Gemini model for this message, or upload the text instead.`,
            },
            { status: 400 },
        );
    }

    // ── Persist the user turn, then build the prompt ─────────────
    const priorCount = await prisma.aiMessage.count({ where: { conversationId } });

    // Attachment *bodies* are not persisted — only which files rode along, so a
    // later turn reads coherently without storing megabytes in the transcript.
    // Must match the client's optimistic suffix exactly, or the message text
    // changes under the user when the thread is reloaded from the server.
    const note = attachmentNote(ingested, images?.length ?? 0);

    await prisma.aiMessage.create({
        data: { conversationId, role: "user", content: content + note },
    });

    // First turn names the thread.
    const autoTitle =
        priorCount === 0 && conversation.title === "New chat"
            ? content.replace(/\s+/g, " ").slice(0, 80)
            : null;

    // Per-request options become the thread's preference so a reload keeps them.
    const wantReasoning = showReasoning ?? conversation.showReasoning;
    const effort = reasoningEffort ?? conversation.reasoningEffort ?? undefined;

    // A support thread has no picker, so it always runs the node default.
    const effectiveModel = isSupport ? null : (modelId ?? conversation.modelId ?? null);

    await prisma.aiConversation.update({
        where: { id: conversationId },
        data: {
            nodeId: node.id,
            ...(modelId !== undefined ? { modelId } : {}),
            ...(autoTitle ? { title: autoTitle } : {}),
            ...(showReasoning !== undefined ? { showReasoning } : {}),
            ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
        },
    });

    // Newest-first fetch, then trim to the context budget and re-sort. The
    // provider and speaker come along so buildTranscript can tell whose voice
    // each turn was — that attribution is the whole multi-model mechanism.
    const recent = await prisma.aiMessage.findMany({
        where: { conversationId, failed: false },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: { role: true, content: true, provider: true, speaker: true },
    });

    // Split one budget between the transcript and any uploaded text, rather
    // than giving each its own. Budgeting them separately let a 3 MB log and a
    // long thread each pass their own check and jointly overflow an 8k local
    // context, which fails as a truncated prompt rather than a clear error.
    const budget = historyCharBudget(node.contextLen);
    const fileBudget = textFiles.length > 0 ? Math.floor(budget * 0.45) : 0;
    const historyBudget = budget - fileBudget;

    const history: ChatTurn[] = [];
    let used = 0;
    for (const msg of recent) {
        used += msg.content.length;
        if (used > historyBudget && history.length > 0) break;
        history.push({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
            provider: msg.provider,
            speaker: msg.speaker,
        });
    }
    history.reverse();

    // ── Ground the answer in the operator's own documentation ────
    // Retrieval is visibility-scoped by role inside searchKnowledge, so a
    // tenant's question never pulls operator-only passages. It runs once, for
    // whichever model is answering — that is what "shared knowledge" means
    // here: the same corpus, the same scope, the same passages.
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

    // Skills are the user's own instructions, so they compose into the system
    // prompt. Support threads get none — that surface answers as the platform,
    // not as whatever persona a customer attached.
    const skills = isSupport ? [] : await composeSkills(conversationId, userId);

    // ── Assemble the system prompt ───────────────────────────────
    const sections: string[] = [
        isSupport
            ? supportSystemPrompt()
            : systemPrompt({ role, tier: node.tier, hasKnowledge: retrieved.length > 0 }),
    ];

    const preamble = multiModelPreamble(history, node.provider);
    if (preamble) sections.push(preamble);

    const skillText = renderSkills(skills);
    if (skillText) sections.push(skillText);

    if (retrieved.length > 0) {
        sections.push(frameUntrusted("knowledge_base", formatContext(retrieved)));
    }

    if (textFiles.length > 0) {
        // Uploaded text is data, not instruction, however imperative it reads.
        // Framing it is control C6 and the reason a "ignore your rules" file
        // does not become a prompt injection.
        sections.push(frameUntrusted(
            "uploaded_files",
            renderFileBlock(textFiles, fileBudget),
        ));
    }

    const system = sections.join("\n\n");

    // Images and native documents ride on the final user turn only; replaying
    // earlier ones would grow every request without adding context.
    const chatImages = (images ?? [])
        .map(parseDataUrl)
        .filter((v): v is ChatImage => v !== null);

    const turns = history.map((t, i) =>
        i === history.length - 1 && t.role === "user"
            ? { ...t, images: chatImages, documents }
            : t,
    );

    const startedAt = Date.now();
    const speaker = node.displayName;

    // ── Stream through the provider adapter ──────────────────────
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let answer = "";
            let reasoning = "";
            let outputTokens: number | null = null;
            let promptTokens: number | null = null;

            const assistant = await prisma.aiMessage.create({
                data: {
                    conversationId,
                    role: "assistant",
                    content: "",
                    modelId: effectiveModel ?? node.modelId,
                    gpuLabel: node.gpuLabel,
                    provider: node.provider,
                    speaker,
                },
                select: { id: true },
            });

            controller.enqueue(sseEvent("meta", {
                messageId: assistant.id,
                model: node.displayName,
                gpuLabel: node.gpuLabel,
                tier: node.tier,
                provider: node.provider,
                vendor: vendorFor(node.provider),
            }));

            try {
                for await (const event of adapter.stream(
                    node,
                    { system, turns, maxTokens: node.maxTokens, effort, modelId: effectiveModel },
                    req.signal,
                )) {
                    switch (event.type) {
                        case "reasoning":
                            // Always accumulated — the exhausted-budget check
                            // below needs it even when the user hides it.
                            reasoning += event.text;
                            controller.enqueue(sseEvent("reasoning", {
                                ...(wantReasoning ? { text: event.text } : {}),
                                chars: reasoning.length,
                            }));
                            break;

                        case "delta":
                            answer += event.text;
                            controller.enqueue(sseEvent("delta", { text: event.text }));
                            break;

                        case "tool":
                            controller.enqueue(sseEvent("tool", {
                                name: event.name,
                                ...(event.detail ? { detail: event.detail } : {}),
                            }));
                            break;

                        case "done":
                            outputTokens = event.outputTokens;
                            promptTokens = event.promptTokens;
                            break;
                    }
                }

                const latencyMs = Date.now() - startedAt;

                // A reasoning model can spend its entire token budget on the
                // scratchpad and emit no answer at all. That is not a silent
                // empty reply — say what happened and what to change.
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
                        provider: node.provider,
                        model: effectiveModel ?? node.modelId,
                        gpu: node.gpuLabel,
                        tier: node.tier,
                        skills: skills.map(s => s.name),
                        files: ingested.length,
                        outputTokens,
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
                    controller.enqueue(sseEvent("done", { latencyMs, outputTokens }));
                }
            } catch (err) {
                // Client disconnects and upstream failures both land here.
                // Keep whatever was generated rather than discarding it.
                const message = describeChatFailure(err, node.displayName);

                // Log the name and stack, not just the message. An error whose
                // message was empty reached the panel as a blank bubble and
                // there was nothing in the log to identify it by either.
                console.error(
                    `[api/ai/chat] ${node.name} (${node.provider}) failed:`,
                    err instanceof Error ? `${err.name}: ${err.message || "(empty message)"}` : String(err),
                    err instanceof Error && err.stack ? `\n${err.stack}` : "",
                );

                await prisma.aiMessage.update({
                    where: { id: assistant.id },
                    data: { content: answer, failed: answer.length === 0 },
                }).catch(() => { /* row may be gone if the thread was deleted mid-stream */ });

                // Only a transport failure means the node is down. A model that
                // will not load is a capacity problem on one model, not an
                // unreachable host — taking the node out of rotation for that
                // would strand every other model it serves.
                if (answer.length === 0 && !req.signal.aborted && !isModelLoadFailure(err)) {
                    await prisma.aiNode.update({
                        where: { id: node.id },
                        data: { online: false, lastError: message.slice(0, 500), lastCheckAt: new Date() },
                    }).catch(() => { /* best effort */ });
                }

                // The controller is already closed when the browser hung up
                // first, and enqueueing then throws — which previously replaced
                // a real failure with a second, more confusing one.
                try {
                    controller.enqueue(sseEvent("error", { message }));
                } catch { /* client is gone; the row above records what happened */ }
            } finally {
                try { controller.close(); } catch { /* already closed */ }
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
