/**
 * AI Node Registry — tier gating for LM Studio inference backends
 *
 * Hardware layout:
 *   PREMIUM  — 2× RTX 2060 (0000:03:00.0, 0000:81:00.0)  — admin only
 *   STANDARD — 2× RX 580                                  — every signed-in user
 *
 * The tier gate is enforced here and nowhere else. API routes call
 * `resolveNodeForUser()` before touching an upstream host, so a user
 * cannot reach a PREMIUM node by guessing its id or posting a baseUrl.
 * The browser never learns a node's baseUrl or apiKey.
 */

import { prisma } from "@/lib/db";
import type { AiNode, AiProviderKind, AiTier } from "@/generated/prisma";
import { adapterFor, vendorFor } from "@/lib/ai-providers";
import { decryptNodeKey } from "@/lib/ai-node-crypto";

// Re-exported so the many existing importers of these from ai-nodes keep
// working; the implementations moved to ai-node-crypto to break an import
// cycle with the provider adapters.
export {
    NO_ENCRYPTION_KEY, nodeKeyEncryptionAvailable, encryptNodeKey, decryptNodeKey,
} from "@/lib/ai-node-crypto";

/** Tiers a role may reach. Admins get both; users get STANDARD only. */
const TIERS_BY_ROLE: Record<string, AiTier[]> = {
    ADMIN: ["STANDARD", "PREMIUM"],
    USER: ["STANDARD"],
};

export function tiersForRole(role: string | null | undefined): AiTier[] {
    return TIERS_BY_ROLE[role ?? "USER"] ?? TIERS_BY_ROLE.USER;
}

/* ─── Node lookup ────────────────────────────────────────────────── */

/** Shape sent to the browser. Deliberately omits baseUrl and apiKey. */
export interface PublicAiNode {
    id: string;
    displayName: string;
    gpuLabel: string;
    provider: AiProviderKind;
    /** "Local" | "Claude" | "Gemini" — grouping label for the picker. */
    vendor: string;
    tier: AiTier;
    modelId: string;
    contextLen: number;
    maxTokens: number;
    /** Whether reasoning_effort actually does anything on this node. */
    reasoningControl: boolean;
    /** True when the model can read PDFs. Drives the file picker's accept list. */
    acceptsDocuments: boolean;
    online: boolean;
    lastCheckAt: Date | null;
}

export function toPublicNode(node: AiNode): PublicAiNode {
    return {
        id: node.id,
        displayName: node.displayName,
        gpuLabel: node.gpuLabel,
        provider: node.provider,
        vendor: vendorFor(node.provider),
        tier: node.tier,
        modelId: node.modelId,
        contextLen: node.contextLen,
        maxTokens: node.maxTokens,
        reasoningControl: node.reasoningControl,
        acceptsDocuments: adapterFor(node.provider).nativeDocuments,
        online: node.online,
        lastCheckAt: node.lastCheckAt,
    };
}

async function roleOf(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    return user?.role ?? "USER";
}

/**
 * Every node the user is allowed to see, cheapest tier first.
 * Read the role from the database rather than the session so a
 * demoted admin loses PREMIUM access immediately.
 */
export async function listNodesForUser(userId: string): Promise<PublicAiNode[]> {
    const tiers = tiersForRole(await roleOf(userId));
    const nodes = await prisma.aiNode.findMany({
        where: { active: true, tier: { in: tiers } },
        orderBy: [{ tier: "asc" }, { displayName: "asc" }],
    });
    return nodes.map(toPublicNode);
}

export type NodeResolution =
    | { node: AiNode; error: null }
    | { node: null; error: "NOT_FOUND" | "FORBIDDEN" | "INACTIVE" };

/**
 * Resolve a node id for a user, enforcing the tier gate.
 *
 * Returns FORBIDDEN — not NOT_FOUND — when a user asks for a PREMIUM node
 * that exists. Callers should record that as an AI_TIER_DENIED audit event;
 * a user probing for RTX nodes is worth seeing in the log.
 *
 * Pass nodeId = null to auto-select the best node the user may use.
 */
export async function resolveNodeForUser(
    userId: string,
    nodeId: string | null,
): Promise<NodeResolution> {
    const tiers = tiersForRole(await roleOf(userId));

    if (!nodeId) {
        const fallback = await prisma.aiNode.findFirst({
            where: { active: true, online: true, tier: { in: tiers } },
            orderBy: [{ tier: "desc" }, { displayName: "asc" }],
        });
        return fallback
            ? { node: fallback, error: null }
            : { node: null, error: "NOT_FOUND" };
    }

    const node = await prisma.aiNode.findUnique({ where: { id: nodeId } });
    if (!node) return { node: null, error: "NOT_FOUND" };
    if (!tiers.includes(node.tier)) return { node: null, error: "FORBIDDEN" };
    if (!node.active) return { node: null, error: "INACTIVE" };

    return { node, error: null };
}

/* ─── Health probe ───────────────────────────────────────────────── */

/**
 * Ask an LM Studio host for its loaded models. Updates `online`/`lastError`.
 * Never throws — an unreachable box is a normal state, not an exception.
 */
export async function probeNode(node: AiNode, timeoutMs = 4000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const apiKey = decryptNodeKey(node.apiKey);

    let online = false;
    let lastError: string | null = null;

    // Only LOCAL nodes expose an OpenAI-compatible /models endpoint. Hosted
    // providers are probed through their adapter (see the admin probe route),
    // which round-trips the real API instead of guessing at a URL shape.
    if (!node.baseUrl) {
        clearTimeout(timer);
        await prisma.aiNode.update({
            where: { id: node.id },
            data: {
                online: false,
                lastError: "No baseUrl — probe this provider from Admin → AI Nodes.",
                lastCheckAt: new Date(),
            },
        });
        return false;
    }

    try {
        const res = await fetch(`${node.baseUrl.replace(/\/$/, "")}/models`, {
            signal: controller.signal,
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        });
        online = res.ok;
        if (!res.ok) lastError = `HTTP ${res.status}`;
    } catch (err) {
        lastError = err instanceof Error ? err.message : "unreachable";
    } finally {
        clearTimeout(timer);
    }

    await prisma.aiNode.update({
        where: { id: node.id },
        data: { online, lastError, lastCheckAt: new Date() },
    });

    return online;
}
