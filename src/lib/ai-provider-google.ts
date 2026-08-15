/**
 * GOOGLE adapter — Gemini via @google/genai
 *
 * Two shape differences from the other providers, both handled here so the
 * chat route never sees them:
 *
 *   - The system prompt is `config.systemInstruction`, not a turn in the list.
 *   - Assistant turns use the role `model`, not `assistant`.
 *
 * Gemini's thinking output arrives as parts flagged `thought` on the same
 * candidate as the answer, rather than on a separate field — so reasoning and
 * answer text are separated by inspecting each part instead of by event type.
 */


import type { ChatEvent, ProviderAdapter } from "@/lib/ai-providers";
import { buildTranscript, googleClient } from "@/lib/ai-providers";

interface GeminiPart {
    text?: string;
    thought?: boolean;
    inlineData?: { mimeType: string; data: string };
}

export const googleAdapter: ProviderAdapter = {
    kind: "GOOGLE",
    vendor: "Gemini",
    nativeDocuments: true,

    async *stream(node, req, signal): AsyncGenerator<ChatEvent> {
        const client = googleClient(node);
        const turns = buildTranscript(req.turns, node.provider);

        const contents = turns.map(t => ({
            role: t.role === "assistant" ? "model" : "user",
            parts: [{ text: t.content }] as GeminiPart[],
        }));

        // Images and PDFs attach to the final user turn only. Gemini takes both
        // through inlineData — a PDF is just another mimeType here, and it is
        // parsed on their side rather than by anything we would write.
        const last = req.turns[req.turns.length - 1];
        if (last?.images?.length || last?.documents?.length) {
            for (let i = contents.length - 1; i >= 0; i--) {
                if (contents[i].role === "user") {
                    contents[i] = {
                        role: "user",
                        parts: [
                            { text: last.content },
                            ...(last.documents ?? []).map(doc => ({
                                inlineData: { mimeType: doc.mediaType, data: doc.data },
                            })),
                            ...(last.images ?? []).map(img => ({
                                inlineData: { mimeType: img.mediaType, data: img.data },
                            })),
                        ],
                    };
                    break;
                }
            }
        }

        const stream = await client.models.generateContentStream({
            model: req.modelId || node.modelId,
            contents,
            config: {
                systemInstruction: req.system,
                maxOutputTokens: req.maxTokens,
                abortSignal: signal,
                // Ask for a thinking summary so the UI can show progress rather
                // than stalling; Gemini omits it unless requested.
                thinkingConfig: { includeThoughts: true },
                ...(node.serverWebAccess ? { tools: [{ googleSearch: {} }] } : {}),
            },
        });

        let outputTokens: number | null = null;
        let promptTokens: number | null = null;

        for await (const chunk of stream) {
            const parts = (chunk.candidates?.[0]?.content?.parts ?? []) as GeminiPart[];
            for (const part of parts) {
                if (!part.text) continue;
                yield part.thought
                    ? { type: "reasoning", text: part.text }
                    : { type: "delta", text: part.text };
            }

            const usage = chunk.usageMetadata;
            if (usage) {
                outputTokens = usage.candidatesTokenCount ?? outputTokens;
                promptTokens = usage.promptTokenCount ?? promptTokens;
            }
        }

        yield { type: "done", outputTokens, promptTokens };
    },

    async probe(node) {
        try {
            const client = googleClient(node);
            const res = await client.models.generateContent({
                model: node.modelId,
                contents: [{ role: "user", parts: [{ text: "hi" }] }],
                config: { maxOutputTokens: 1 },
            });
            return {
                ok: true,
                detail: `reachable — ${res.modelVersion ?? node.modelId}`,
            };
        } catch (err) {
            return { ok: false, detail: err instanceof Error ? err.message : "unreachable" };
        }
    },

    async listModels(node) {
        const client = googleClient(node);
        const out: string[] = [];
        // The SDK paginates; a handful of pages is plenty for a picker.
        for await (const m of await client.models.list()) {
            // Names come back as "models/gemini-…"; the request wants the bare id.
            if (m.name) out.push(m.name.replace(/^models\//, ""));
            if (out.length >= 100) break;
        }
        return out;
    },
};
