export type AiTier = "STANDARD" | "PREMIUM";

export interface AiNodeSummary {
    id: string;
    displayName: string;
    gpuLabel: string;
    tier: AiTier;
    modelId: string;
    contextLen: number;
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
}
