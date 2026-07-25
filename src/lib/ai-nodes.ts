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

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import type { AiNode, AiTier } from "@/generated/prisma";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Tiers a role may reach. Admins get both; users get STANDARD only. */
const TIERS_BY_ROLE: Record<string, AiTier[]> = {
    ADMIN: ["STANDARD", "PREMIUM"],
    USER: ["STANDARD"],
};

export function tiersForRole(role: string | null | undefined): AiTier[] {
    return TIERS_BY_ROLE[role ?? "USER"] ?? TIERS_BY_ROLE.USER;
}

/* ─── API key encryption at rest ─────────────────────────────────── */

/** Message surfaced to an admin who tries to store a key with no cipher key set. */
export const NO_ENCRYPTION_KEY =
    "AI_NODE_ENCRYPTION_KEY is not configured, so an upstream API key cannot be stored " +
    "safely. Generate one with `openssl rand -hex 32`, or leave the API key blank — " +
    "LM Studio does not require one by default.";

/** True when node API keys can be encrypted at rest. */
export function nodeKeyEncryptionAvailable(): boolean {
    const hex = process.env.AI_NODE_ENCRYPTION_KEY || process.env.TOTP_ENCRYPTION_KEY;
    return Boolean(hex && hex.length === 64);
}

function getKey(): Buffer {
    const hex = process.env.AI_NODE_ENCRYPTION_KEY || process.env.TOTP_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error(NO_ENCRYPTION_KEY);
    }
    return Buffer.from(hex, "hex");
}

/** Encrypt an upstream API key. Returns "hex(iv):hex(ciphertext+tag)". */
export function encryptNodeKey(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return `${iv.toString("hex")}:${Buffer.concat([ct, cipher.getAuthTag()]).toString("hex")}`;
}

/** Decrypt an upstream API key. Returns null rather than throwing — a bad
 *  key must degrade to "no auth header", not crash the chat request. */
export function decryptNodeKey(encrypted: string | null): string | null {
    if (!encrypted) return null;
    try {
        const idx = encrypted.indexOf(":");
        if (idx === -1) return null;
        const iv = Buffer.from(encrypted.slice(0, idx), "hex");
        const blob = Buffer.from(encrypted.slice(idx + 1), "hex");
        if (iv.length !== IV_LENGTH) return null;

        const ct = blob.subarray(0, blob.length - AUTH_TAG_LENGTH);
        const tag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
        const decipher = createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    } catch {
        console.error("[ai-nodes] Failed to decrypt node API key — sending request unauthenticated.");
        return null;
    }
}

/* ─── Node lookup ────────────────────────────────────────────────── */

/** Shape sent to the browser. Deliberately omits baseUrl and apiKey. */
export interface PublicAiNode {
    id: string;
    displayName: string;
    gpuLabel: string;
    tier: AiTier;
    modelId: string;
    contextLen: number;
    online: boolean;
    lastCheckAt: Date | null;
}

export function toPublicNode(node: AiNode): PublicAiNode {
    return {
        id: node.id,
        displayName: node.displayName,
        gpuLabel: node.gpuLabel,
        tier: node.tier,
        modelId: node.modelId,
        contextLen: node.contextLen,
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
