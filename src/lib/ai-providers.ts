/**
 * Provider abstraction — one interface over local and hosted models
 *
 * Every model the platform can talk to is reached through an adapter selected
 * by `AiNode.provider`. The chat route knows nothing about wire formats; it
 * hands an adapter a normalised request and consumes a normalised stream.
 * Adding a provider is a new adapter plus an enum value, never a branch inside
 * the transport.
 *
 * ── The shared-transcript problem ──────────────────────────────────
 *
 * A conversation can contain turns written by several different models. Naively
 * replaying those as `assistant` turns makes every model believe it wrote them
 * all — it will defend reasoning it never produced and contradict itself when
 * the earlier turn came from a different model.
 *
 * So a turn produced by a *different* model than the one now being called is
 * relabelled as attributed text rather than replayed as that model's own voice.
 * Its own prior turns pass through as ordinary assistant turns. See
 * `buildTranscript()` — this is the mechanism behind "each model can see what
 * the others said".
 *
 * ── Credentials ───────────────────────────────────────────────────
 *
 * API keys live encrypted in `AiNode.apiKey` and are decrypted here, server
 * side, per request. They are never returned by any route and never reach the
 * browser — the client only ever names a node id.
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { AiNode, AiProviderKind } from "@/generated/prisma";
import { decryptNodeKey } from "@/lib/ai-node-crypto";

/* ─── Normalised request / stream shapes ─────────────────────────── */

export interface ChatImage {
    /** Raw base64, no data: prefix. */
    data: string;
    mediaType: string;
}

/**
 * A file passed through to the provider in its original bytes (PDF today).
 *
 * Text-like uploads never reach here — the chat route decodes them and inlines
 * them as framed untrusted text, which works on every provider including local
 * runtimes. This carries only formats where the provider's own parser beats
 * anything we would write.
 */
export interface ChatDocument {
    filename: string;
    mediaType: string;
    /** Raw base64, no data: prefix. */
    data: string;
}

export interface ChatTurn {
    role: "user" | "assistant";
    content: string;
    /** Provider that produced an assistant turn; absent on user turns. */
    provider?: AiProviderKind | null;
    /** Display name of the producing model, for cross-model attribution. */
    speaker?: string | null;
    /** Only ever set on the final user turn. */
    images?: ChatImage[];
    /** Only ever set on the final user turn. */
    documents?: ChatDocument[];
}

export interface ChatRequest {
    system: string;
    turns: ChatTurn[];
    maxTokens: number;
    /** "off" | "low" | "medium" | "high" — mapped per provider, or ignored. */
    effort?: string | null;
}

/** Streamed events, uniform across providers. */
export type ChatEvent =
    | { type: "reasoning"; text: string }
    | { type: "delta"; text: string }
    /** Provider ran code in its own sandbox. Surfaced so the UI can show it. */
    | { type: "tool"; name: string; detail?: string }
    | { type: "done"; outputTokens: number | null; promptTokens: number | null };

export interface ProviderAdapter {
    readonly kind: AiProviderKind;
    /** Human label for the provider, used in cross-model attribution. */
    readonly vendor: string;
    /**
     * Whether the provider accepts original document bytes (PDF). False for
     * OpenAI-compatible local runtimes, which have no document block — the
     * route reports that to the user instead of dropping the file silently.
     */
    readonly nativeDocuments: boolean;
    stream(node: AiNode, req: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent>;
    /** Cheap reachability probe for the admin panel. */
    probe(node: AiNode): Promise<{ ok: boolean; detail: string }>;
}

/* ─── Shared transcript construction ─────────────────────────────── */

/**
 * Rewrite a mixed-model transcript for one target provider.
 *
 * Turns produced by the *same* provider stay as first-person assistant turns.
 * Turns from a different model are relabelled with an explicit speaker prefix
 * so the target model reads them as another participant's contribution rather
 * than its own. Consecutive foreign turns are merged into one block, because
 * several providers reject two assistant turns in a row.
 */
export function buildTranscript(turns: ChatTurn[], target: AiProviderKind): ChatTurn[] {
    const out: ChatTurn[] = [];

    for (const turn of turns) {
        if (turn.role === "user") {
            out.push(turn);
            continue;
        }

        // Narrow explicitly rather than via a boolean: an absent provider is a
        // pre-multi-model row, which is by definition this model's own voice.
        const from = turn.provider;
        if (!from || from === target) {
            out.push({ role: "assistant", content: turn.content });
            continue;
        }

        const label = turn.speaker || vendorFor(from);
        const attributed = `[${label}]: ${turn.content}`;
        const prev = out[out.length - 1];

        // Merge into a preceding foreign block rather than emitting adjacent
        // assistant turns, which Anthropic and Gemini both reject.
        if (prev && prev.role === "assistant" && prev.content.startsWith("[")) {
            prev.content += `\n\n${attributed}`;
        } else {
            out.push({ role: "assistant", content: attributed });
        }
    }

    return out;
}

/**
 * Preamble explaining the multi-model transcript.
 *
 * Only added when the conversation actually contains another model's work —
 * a single-model chat should not carry instructions about participants that
 * do not exist.
 */
export function multiModelPreamble(turns: ChatTurn[], target: AiProviderKind): string {
    const others = new Set<string>();
    for (const t of turns) {
        if (t.role === "assistant" && t.provider && t.provider !== target) {
            others.add(t.speaker || vendorFor(t.provider));
        }
    }
    if (others.size === 0) return "";

    return [
        `This conversation has more than one AI participant. Turns prefixed with a name in square brackets — ${[...others].join(", ")} — were written by a different model, not by you.`,
        "Treat them as another participant's contribution: you may build on them, disagree with them, or correct them, but never claim them as your own reasoning.",
        "The user can see every participant's messages.",
    ].join(" ");
}

export function vendorFor(kind: AiProviderKind): string {
    switch (kind) {
        case "ANTHROPIC": return "Claude";
        case "GOOGLE": return "Gemini";
        case "OPENAI": return "OpenAI";
        default: return "Local";
    }
}

/* ─── Adapter registry ───────────────────────────────────────────── */

import { localAdapter } from "@/lib/ai-provider-local";
import { anthropicAdapter } from "@/lib/ai-provider-anthropic";
import { googleAdapter } from "@/lib/ai-provider-google";

const ADAPTERS: Partial<Record<AiProviderKind, ProviderAdapter>> = {
    LOCAL: localAdapter,
    OPENAI: localAdapter, // same wire format; the tier gate is what differs
    ANTHROPIC: anthropicAdapter,
    GOOGLE: googleAdapter,
};

export function adapterFor(kind: AiProviderKind): ProviderAdapter {
    const adapter = ADAPTERS[kind];
    if (!adapter) throw new Error(`No adapter registered for provider ${kind}`);
    return adapter;
}

/* ─── Credential helpers, shared by adapters ─────────────────────── */

/**
 * Decrypt a node's API key.
 *
 * Hosted providers cannot work without one, so a missing or undecryptable key
 * is an error here rather than a silent unauthenticated request that fails
 * later with a confusing 401 from the vendor.
 */
export function requireKey(node: AiNode): string {
    const key = decryptNodeKey(node.apiKey);
    if (!key) {
        throw new Error(
            `${vendorFor(node.provider)} node "${node.displayName}" has no usable API key. ` +
            `Add one in Admin → AI Nodes.`,
        );
    }
    return key;
}

/** Clients are stateless and cheap; construct per request rather than caching
 *  a client whose key may have been rotated in the admin panel since. */
export function anthropicClient(node: AiNode): Anthropic {
    return new Anthropic({
        apiKey: requireKey(node),
        ...(node.baseUrl ? { baseURL: node.baseUrl } : {}),
    });
}

export function googleClient(node: AiNode): GoogleGenAI {
    return new GoogleGenAI({ apiKey: requireKey(node) });
}
