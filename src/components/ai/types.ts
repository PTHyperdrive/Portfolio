export type AiTier = "STANDARD" | "PREMIUM";

/** "off" is only meaningful on nodes whose runtime honours it. */
export type ReasoningEffort = "off" | "low" | "medium" | "high";

export interface AiNodeSummary {
    id: string;
    displayName: string;
    gpuLabel: string;
    tier: AiTier;
    modelId: string;
    contextLen: number;
    maxTokens: number;
    /** False when reasoning_effort is ignored by this runtime. */
    reasoningControl: boolean;
    online: boolean;
    lastCheckAt: string | null;
}

export interface ConversationSummary {
    id: string;
    title: string;
    nodeId: string | null;
    updatedAt: string;
    messageCount: number;
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    modelId?: string | null;
    gpuLabel?: string | null;
    latencyMs?: number | null;
    outputTokens?: number | null;
    failed?: boolean;
    createdAt?: string;
    /** True while tokens are still arriving for this message. */
    streaming?: boolean;
    /** Scratchpad from a reasoning model. Live-only — not persisted. */
    reasoning?: string;
    /** Scratchpad length even when the text itself is withheld. */
    reasoningChars?: number;
}

/**
 * Where the current turn is. Drives the composer, the status pill and
 * whether a new send joins the queue instead of starting immediately.
 *
 *   idle       nothing in flight
 *   connecting request sent, no bytes back yet
 *   thinking   reasoning deltas arriving, no answer yet
 *   streaming  answer tokens arriving
 */
export type ChatPhase = "idle" | "connecting" | "thinking" | "streaming";

/** A message typed while a generation was already running. */
export interface QueuedMessage {
    id: string;
    content: string;
}
