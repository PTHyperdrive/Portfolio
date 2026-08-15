/**
 * Provider facts that both the server and the browser need
 *
 * Kept free of any SDK import on purpose. `ai-providers.ts` pulls in the
 * Anthropic and Google clients, so a client component importing from there
 * would drag both into the browser bundle. The admin panel needs to know which
 * fields a provider requires; that is all this file carries.
 *
 * The requirement table is the single source of truth for "is this node
 * configured?" — the zod refinements on the node routes and the enabled state
 * of the Create button both read it, so the form cannot allow something the
 * API will reject.
 */

import type { AiProviderKind } from "@/generated/prisma";

export const PROVIDER_KINDS = [
    "LOCAL", "ANTHROPIC", "GOOGLE", "OPENAI", "DEEPSEEK",
] as const satisfies readonly AiProviderKind[];

export const PROVIDER_LABELS: Record<AiProviderKind, string> = {
    LOCAL: "Local — LM Studio / vLLM / Ollama",
    ANTHROPIC: "Anthropic — Claude",
    GOOGLE: "Google — Gemini",
    OPENAI: "OpenAI-compatible",
    DEEPSEEK: "DeepSeek",
};

/** Short vendor name, used for cross-model attribution in a shared transcript. */
export const PROVIDER_VENDORS: Record<AiProviderKind, string> = {
    LOCAL: "Local",
    ANTHROPIC: "Claude",
    GOOGLE: "Gemini",
    OPENAI: "OpenAI",
    DEEPSEEK: "DeepSeek",
};

export interface ProviderRequirements {
    /**
     * True when the provider has no SDK default endpoint and must be told
     * where to connect. Everything on the OpenAI-compatible adapter needs
     * this — including DeepSeek, whose endpoint is fixed but still explicit.
     */
    baseUrl: boolean;
    /** True when a request without a credential cannot succeed. */
    apiKey: boolean;
}

export const PROVIDER_REQUIREMENTS: Record<AiProviderKind, ProviderRequirements> = {
    // A LAN runtime: reachable without a key, useless without an address.
    LOCAL: { baseUrl: true, apiKey: false },
    // Hosted, but on the OpenAI adapter, which builds its own URL and so has
    // nothing to fall back on. Both fields are mandatory.
    OPENAI: { baseUrl: true, apiKey: true },
    DEEPSEEK: { baseUrl: true, apiKey: true },
    // Official SDKs know their own endpoint; a base URL here is an override
    // for a proxy or a region, not a requirement.
    ANTHROPIC: { baseUrl: false, apiKey: true },
    GOOGLE: { baseUrl: false, apiKey: true },
};

/** Whether a prospective node has everything its provider needs. */
export function isConfigured(
    provider: AiProviderKind,
    fields: { baseUrl?: string | null; apiKey?: string | null },
): boolean {
    const need = PROVIDER_REQUIREMENTS[provider];
    if (need.baseUrl && !fields.baseUrl) return false;
    if (need.apiKey && !fields.apiKey) return false;
    return true;
}
