/**
 * LOCAL adapter — OpenAI-compatible HTTP (LM Studio, vLLM, Ollama)
 *
 * This is the original transport, unchanged in behaviour: raw fetch against an
 * OpenAI-shaped `/chat/completions`, SSE parsed by hand. No SDK, because the
 * OpenAI SDK would add a dependency purely to speak a format we already parse,
 * and these endpoints vary enough between runtimes that the loose parsing is a
 * feature.
 *
 * Reasoning models on this path stream their scratchpad on `reasoning_content`
 * rather than `content` — measured against gemma-4-26b-a4b-qat, which emits ~46
 * reasoning deltas before the first answer token. Dropping those leaves the UI
 * blank through the whole thinking phase, so they are forwarded separately.
 */

import type { AiNode } from "@/generated/prisma";
import { decryptNodeKey } from "@/lib/ai-node-crypto";
import type { ChatEvent, ProviderAdapter } from "@/lib/ai-providers";
import { buildTranscript } from "@/lib/ai-providers";

type Part =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

function endpoint(node: AiNode, path: string): string {
    if (!node.baseUrl) {
        throw new Error(`Local node "${node.displayName}" has no baseUrl configured.`);
    }
    return `${node.baseUrl.replace(/\/$/, "")}${path}`;
}

function authHeaders(node: AiNode): Record<string, string> {
    const key = decryptNodeKey(node.apiKey);
    return key ? { Authorization: `Bearer ${key}` } : {};
}

export const localAdapter: ProviderAdapter = {
    kind: "LOCAL",
    vendor: "Local",
    // No document block exists in the OpenAI chat format. The chat route turns
    // that into an explicit error rather than dropping the file quietly.
    nativeDocuments: false,

    async *stream(node, req, signal): AsyncGenerator<ChatEvent> {
        const turns = buildTranscript(req.turns, node.provider);

        const messages: { role: string; content: string | Part[] }[] = [
            { role: "system", content: req.system },
            ...turns.map(t => ({ role: t.role, content: t.content })),
        ];

        // Images ride on the final user turn only; replaying earlier images
        // would grow the request without adding context the model still needs.
        const last = req.turns[req.turns.length - 1];
        if (last?.images?.length) {
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === "user") {
                    messages[i] = {
                        role: "user",
                        content: [
                            { type: "text", text: last.content },
                            ...last.images.map(img => ({
                                type: "image_url" as const,
                                image_url: { url: `data:${img.mediaType};base64,${img.data}` },
                            })),
                        ],
                    };
                    break;
                }
            }
        }

        const res = await fetch(endpoint(node, "/chat/completions"), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders(node) },
            body: JSON.stringify({
                model: node.modelId,
                messages,
                max_tokens: req.maxTokens,
                stream: true,
                stream_options: { include_usage: true },
                // Only sent where the runtime is known to honour it. LM Studio
                // accepts and silently ignores reasoning_effort for several
                // models, so shipping it blindly would be a control that lies.
                ...(node.reasoningControl && req.effort && req.effort !== "off"
                    ? { reasoning_effort: req.effort }
                    : {}),
                ...(node.reasoningControl && req.effort === "off"
                    ? { chat_template_kwargs: { enable_thinking: false } }
                    : {}),
            }),
            signal,
        });

        if (!res.ok || !res.body) {
            const detail = await res.text().catch(() => "");
            throw new Error(`${node.displayName} returned HTTP ${res.status}. ${detail.slice(0, 300)}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let promptTokens: number | null = null;
        let outputTokens: number | null = null;

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

                    let chunk: Record<string, unknown>;
                    try { chunk = JSON.parse(payload); }
                    catch { continue; } // partial JSON across a chunk boundary

                    const choice = (chunk.choices as { delta?: Record<string, string> }[] | undefined)?.[0];
                    const delta = choice?.delta;

                    const think = delta?.reasoning_content ?? delta?.reasoning ?? "";
                    if (think) yield { type: "reasoning", text: think };

                    const text = delta?.content ?? "";
                    if (text) yield { type: "delta", text };

                    const usage = chunk.usage as { completion_tokens?: number; prompt_tokens?: number } | undefined;
                    if (usage) {
                        outputTokens = usage.completion_tokens ?? null;
                        promptTokens = usage.prompt_tokens ?? null;
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        yield { type: "done", outputTokens, promptTokens };
    },

    async probe(node) {
        try {
            const res = await fetch(endpoint(node, "/models"), {
                headers: authHeaders(node),
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
            const body = await res.json();
            const ids: string[] = (body?.data ?? [])
                .map((m: { id?: string }) => m.id)
                .filter((v: unknown): v is string => typeof v === "string");
            return ids.length && !ids.includes(node.modelId)
                ? { ok: true, detail: `reachable, but "${node.modelId}" is not loaded (${ids.join(", ")})` }
                : { ok: true, detail: "reachable" };
        } catch (err) {
            return { ok: false, detail: err instanceof Error ? err.message : "unreachable" };
        }
    },
};
