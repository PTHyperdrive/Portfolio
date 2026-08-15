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
import { prisma } from "@/lib/db";
import { decryptNodeKey, encryptNodeKey } from "@/lib/ai-node-crypto";
import { isSubscriptionToken, normaliseToken, refreshClaudeToken } from "@/lib/claude-oauth";

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
            `${vendorFor(node.provider)} node "${node.displayName}" has no usable subscription token or API key. ` +
            `Add one in Admin → AI Nodes.`,
        );
    }
    return key;
}

/**
 * How long before expiry a subscription token is renewed early.
 *
 * A token that expires mid-stream fails the whole turn, so it is replaced
 * while there is still comfortable margin rather than at the last moment.
 */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * In-flight refreshes, keyed by node id.
 *
 * Refresh tokens are usually single-use: two concurrent chats noticing the
 * same expiry would each spend the token, and whichever landed second would
 * invalidate the first. Sharing one promise per node makes that impossible
 * within this process, which is all a single pm2 fork needs.
 */
const refreshing = new Map<string, Promise<string>>();

/**
 * Return a usable Anthropic credential, renewing it first if it is about to
 * expire.
 *
 * API keys pass straight through — they do not expire. Subscription tokens do,
 * and a node authenticated with one goes green, works for a few hours, then
 * fails 401 forever unless something renews it. That something is here.
 */
export async function ensureAnthropicToken(node: AiNode): Promise<string> {
    const key = normaliseToken(requireKey(node));

    if (!isSubscriptionToken(key)) return key;

    const expiresAt = node.tokenExpiresAt?.getTime();
    if (!expiresAt || expiresAt - REFRESH_SKEW_MS > Date.now()) return key;

    const refreshToken = decryptNodeKey(node.refreshToken);
    if (!refreshToken) {
        // A hand-pasted token has no refresh half. Say exactly what to do
        // rather than letting the vendor return an opaque 401.
        throw new Error(
            `The Claude subscription token for "${node.displayName}" has expired and cannot ` +
            `renew itself, because it was entered by hand rather than obtained through the ` +
            `login flow. Re-authenticate in Admin → AI Nodes.`,
        );
    }

    const existing = refreshing.get(node.id);
    if (existing) return existing;

    const task = (async () => {
        try {
            const fresh = await refreshClaudeToken(refreshToken);
            await prisma.aiNode.update({
                where: { id: node.id },
                data: {
                    apiKey: encryptNodeKey(fresh.accessToken),
                    // Persist whatever came back: a rotating server issues a new
                    // refresh token each time, and keeping the old one would
                    // break the next renewal.
                    ...(fresh.refreshToken
                        ? { refreshToken: encryptNodeKey(fresh.refreshToken) }
                        : {}),
                    tokenExpiresAt: fresh.expiresAt ? new Date(fresh.expiresAt) : null,
                    online: true,
                    lastError: null,
                },
            });
            return normaliseToken(fresh.accessToken);
        } catch (err) {
            const message = err instanceof Error ? err.message : "token refresh failed";
            await prisma.aiNode.update({
                where: { id: node.id },
                data: {
                    online: false,
                    lastError: `Subscription token expired and could not be renewed: ${message}`,
                    lastCheckAt: new Date(),
                },
            }).catch(() => { /* the throw below is what matters */ });
            throw new Error(
                `Could not renew the Claude subscription for "${node.displayName}": ${message}. ` +
                `Re-authenticate in Admin → AI Nodes.`,
            );
        } finally {
            refreshing.delete(node.id);
        }
    })();

    refreshing.set(node.id, task);
    return task;
}

/**
 * Clients are stateless and cheap; construct per request rather than caching
 * a client whose key may have been rotated in the admin panel since.
 *
 * Subscription tokens authenticate as `Authorization: Bearer` (the SDK's
 * `authToken`), pay-per-token API keys as `x-api-key` (`apiKey`).
 */
export async function anthropicClient(node: AiNode): Promise<Anthropic> {
    const token = await ensureAnthropicToken(node);

    return new Anthropic({
        ...(isSubscriptionToken(token) ? { authToken: token } : { apiKey: token }),
        ...(node.baseUrl ? { baseURL: node.baseUrl } : {}),
    });
}

export function googleClient(node: AiNode): GoogleGenAI {
    return new GoogleGenAI({ apiKey: requireKey(node) });
}
