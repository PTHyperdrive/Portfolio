/**
 * ANTHROPIC adapter — Claude via the official SDK
 *
 * Uses `@anthropic-ai/sdk` rather than raw HTTP: the SDK owns retries, timeout
 * scaling for large `max_tokens`, and streaming event shapes. Supports both
 * Claude Subscriptions (OAuth/setup/session tokens `sk-ant-oat...` via Bearer auth)
 * and standard Anthropic API keys (`sk-ant-api...`).
 *
 * ── The sandbox ───────────────────────────────────────────────────
 *
 * When `node.serverSandbox` is set, the request declares the `code_execution`
 * server tool. Claude then writes and runs code in an Anthropic-hosted
 * container automatically whenever a task needs it — data analysis, file
 * processing, calculation — with no execution on our infrastructure and no
 * container for us to manage. That is the "auto-handles the sandbox" behaviour;
 * it is opt-in per node because it is billed compute and an execution surface.
 *
 * `serverWebAccess` separately enables Claude's hosted web search and fetch.
 * The `_20260209` tool versions have dynamic filtering built in, which runs
 * code under the hood — so when they are enabled we must NOT also declare a
 * standalone code-execution tool, or the model sees two execution environments
 * and picks badly. The tool list below encodes that mutual exclusion.
 *
 * ── Thinking ──────────────────────────────────────────────────────
 *
 * Adaptive thinking with `display: "summarized"`. The default is "omitted",
 * which streams thinking blocks with empty text — to a live UI that reads as a
 * long silent pause before any output, the same failure the local adapter
 * works around for reasoning models.
 */

import type Anthropic from "@anthropic-ai/sdk";

import type { ChatEvent, ProviderAdapter } from "@/lib/ai-providers";
import { anthropicClient, buildTranscript } from "@/lib/ai-providers";

/** Effort levels the API accepts. "off" is ours, not theirs. */
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

export const anthropicAdapter: ProviderAdapter = {
    kind: "ANTHROPIC",
    vendor: "Claude",
    nativeDocuments: true,

    async *stream(node, req, signal): AsyncGenerator<ChatEvent> {
        const client = await anthropicClient(node);
        const turns = buildTranscript(req.turns, node.provider);

        const messages: Anthropic.MessageParam[] = turns.map(t => ({
            role: t.role,
            content: t.content,
        }));

        // Images and PDFs attach to the final user turn only. Attachments come
        // before the text so the question reads as being *about* them — Claude
        // handles that ordering measurably better than the reverse.
        const last = req.turns[req.turns.length - 1];
        if (last?.images?.length || last?.documents?.length) {
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === "user") {
                    messages[i] = {
                        role: "user",
                        content: [
                            ...(last.documents ?? []).map(doc => ({
                                type: "document" as const,
                                title: doc.filename,
                                source: {
                                    type: "base64" as const,
                                    media_type: "application/pdf" as const,
                                    data: doc.data,
                                },
                            })),
                            ...(last.images ?? []).map(img => ({
                                type: "image" as const,
                                source: {
                                    type: "base64" as const,
                                    media_type: img.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
                                    data: img.data,
                                },
                            })),
                            { type: "text" as const, text: last.content },
                        ],
                    };
                    break;
                }
            }
        }

        // Web tools bring their own execution environment; declaring a second
        // one alongside them confuses tool selection.
        const tools: Anthropic.ToolUnion[] = node.serverWebAccess
            ? [
                { type: "web_search_20260209", name: "web_search" },
                { type: "web_fetch_20260209", name: "web_fetch" },
            ]
            : node.serverSandbox
                ? [{ type: "code_execution_20260120", name: "code_execution" }]
                : [];

        const effort = req.effort && EFFORTS.has(req.effort) ? req.effort : undefined;

        const stream = client.messages.stream(
            {
                model: req.modelId || node.modelId,
                max_tokens: req.maxTokens,
                system: req.system,
                messages,
                thinking: { type: "adaptive", display: "summarized" },
                ...(effort ? { output_config: { effort } } : {}),
                ...(tools.length ? { tools } : {}),
            } as Anthropic.MessageStreamParams,
            { signal },
        );

        for await (const event of stream) {
            if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta") {
                    yield { type: "delta", text: event.delta.text };
                } else if (event.delta.type === "thinking_delta") {
                    yield { type: "reasoning", text: event.delta.thinking };
                }
            } else if (event.type === "content_block_start") {
                const block = event.content_block;
                // Surface sandbox and web activity so the UI can show that
                // Claude went and did something rather than stalling.
                if (block.type === "server_tool_use") {
                    yield { type: "tool", name: block.name };
                }
            }
        }

        const final = await stream.finalMessage();

        // A safety classifier can decline with HTTP 200 and an empty content
        // array — code that reads content[0] unconditionally breaks here.
        if (final.stop_reason === "refusal") {
            const category = final.stop_details?.type === "refusal"
                ? final.stop_details.category ?? "unspecified"
                : "unspecified";
            throw new Error(
                `Claude declined this request (${category}). Rephrasing, or using a different model, may work.`,
            );
        }

        yield {
            type: "done",
            outputTokens: final.usage.output_tokens ?? null,
            promptTokens: final.usage.input_tokens ?? null,
        };
    },

    async probe(node) {
        try {
            const client = await anthropicClient(node);
            // One-token round trip is the cheapest proof that the key, the
            // model id, and the network path all work together.
            const res = await client.messages.create({
                model: node.modelId,
                max_tokens: 1,
                messages: [{ role: "user", content: "hi" }],
            });
            return { ok: true, detail: `reachable — ${res.model}` };
        } catch (err) {
            return { ok: false, detail: err instanceof Error ? err.message : "unreachable" };
        }
    },

    async listModels(node) {
        const client = await anthropicClient(node);
        const page = await client.models.list({ limit: 50 });
        return page.data.map(m => m.id);
    },
};
