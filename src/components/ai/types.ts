export type AiTier = "STANDARD" | "PREMIUM";

export type AiProviderKind = "LOCAL" | "ANTHROPIC" | "GOOGLE" | "OPENAI" | "DEEPSEEK";

/** "off" is only meaningful on nodes whose runtime honours it. */
export type ReasoningEffort = "off" | "low" | "medium" | "high";

export interface AiNodeSummary {
    id: string;
    displayName: string;
    gpuLabel: string;
    provider: AiProviderKind;
    /** "Local" | "Claude" | "Gemini" — how the picker groups models. */
    vendor: string;
    tier: AiTier;
    modelId: string;
    contextLen: number;
    maxTokens: number;
    /** False when reasoning_effort is ignored by this runtime. */
    reasoningControl: boolean;
    /** True when the model reads PDFs directly. */
    acceptsDocuments: boolean;
    online: boolean;
    lastCheckAt: string | null;
}

/** One model a node can run, as reported by the runtime. */
export interface ModelInfo {
    id: string;
    /** Undefined where the provider cannot say whether it is resident. */
    loaded?: boolean;
    type?: string;
    maxContext?: number;
}

/** A node's model catalogue, discovered rather than configured. */
export interface NodeModels {
    models: ModelInfo[];
    defaultModelId: string;
    /** False when the runtime does not report residency, so the UI stays quiet. */
    reportsLoadState: boolean;
    loading: boolean;
    error?: string;
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
    /**
     * Which model wrote this turn. Present on multi-model threads and absent on
     * rows written before they existed — the UI falls back to "Assistant".
     */
    provider?: AiProviderKind | null;
    speaker?: string | null;
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
    /** Provider-side tools this turn ran (code execution, web search). */
    tools?: string[];
}

/**
 * An attachment that has been through /api/ai/files and is ready to send.
 *
 * Text files carry their extracted `text`; PDFs and images carry base64 `data`.
 * The distinction decides which providers can take the message, so it is kept
 * explicit rather than inferred from the MIME type at send time.
 */
export interface Attachment {
    filename: string;
    mediaType: string;
    bytes: number;
    text?: string;
    data?: string;
}

export interface SkillSummary {
    id: string;
    name: string;
    description: string | null;
    shared: boolean;
    /** False for a shared skill published by someone else — read-only here. */
    owned: boolean;
    fileCount: number;
    updatedAt: string;
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
    /** Attachments travel with the queued turn, not the composer. */
    images?: string[];
    files?: Attachment[];
}
