/**
 * AI Knowledge Base — chunking, embedding and retrieval
 *
 * Embeddings are produced by the operator's own LM Studio host
 * (text-embedding-nomic-embed-text-v1.5, 768-dim), so infrastructure
 * documentation never leaves the LAN to reach a third-party embedding API.
 * That is a deliberate part of the security posture, not just a cost choice.
 *
 * Retrieval is visibility-scoped at the query (control C4 in ai-security):
 * a STANDARD caller's search never loads ADMIN chunks, so operator-only
 * detail cannot reach them laundered through a summary.
 */

import { prisma } from "@/lib/db";
import { decryptNodeKey } from "@/lib/ai-nodes";
import { visibilitiesForRole, redactSecrets } from "@/lib/ai-security";
import type { AiNode } from "@/generated/prisma";

/** Target chunk size in characters. Roughly 200–250 tokens of prose. */
const CHUNK_CHARS = 900;
const CHUNK_OVERLAP = 150;

/** Chunks returned per search, before the model sees them. */
export const TOP_K = 5;

/** Below this cosine score a chunk is treated as irrelevant noise. */
export const MIN_SCORE = 0.35;

/* ─── Chunking ───────────────────────────────────────────────────── */

/**
 * Split on paragraph boundaries, packing up to CHUNK_CHARS.
 *
 * Markdown headings are carried into the following chunk so a slice like
 * "10.0.1.0/24 is the hypervisor LAN" keeps the "## Topology" context that
 * makes it retrievable and interpretable.
 */
export function chunkDocument(content: string): string[] {
    const paragraphs = content.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const chunks: string[] = [];

    let current = "";
    let heading = "";

    for (const para of paragraphs) {
        if (/^#{1,6}\s/.test(para)) heading = para;

        const candidate = current ? `${current}\n\n${para}` : para;

        if (candidate.length > CHUNK_CHARS && current) {
            chunks.push(current);
            const tail = current.slice(-CHUNK_OVERLAP);
            current = heading && !para.startsWith(heading)
                ? `${heading}\n\n${tail}\n\n${para}`
                : `${tail}\n\n${para}`;
        } else {
            current = candidate;
        }
    }

    if (current.trim()) chunks.push(current);
    return chunks;
}

/* ─── Embedding ──────────────────────────────────────────────────── */

/** The node that serves embeddings, if one is configured. */
export async function embeddingNode(): Promise<AiNode | null> {
    return prisma.aiNode.findFirst({
        where: { active: true, embedModelId: { not: null } },
        orderBy: { tier: "desc" },
    });
}

/**
 * Embed one or more strings. Returns null when no embedding node is
 * configured or reachable — callers fall back to keyword search rather than
 * failing the whole chat.
 */
export async function embed(texts: string[], node?: AiNode | null): Promise<number[][] | null> {
    const target = node ?? await embeddingNode();
    if (!target?.embedModelId) return null;

    const apiKey = decryptNodeKey(target.apiKey);

    try {
        const res = await fetch(`${target.baseUrl.replace(/\/$/, "")}/embeddings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify({ model: target.embedModelId, input: texts }),
            signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
            console.error(`[ai-knowledge] embed failed on ${target.name}: HTTP ${res.status}`);
            return null;
        }

        const body = await res.json();
        const vectors = (body?.data ?? [])
            .sort((a: { index?: number }, b: { index?: number }) => (a.index ?? 0) - (b.index ?? 0))
            .map((d: { embedding: number[] }) => d.embedding);

        return vectors.length === texts.length ? vectors : null;
    } catch (err) {
        console.error("[ai-knowledge] embed error:", err instanceof Error ? err.message : err);
        return null;
    }
}

function cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length && i < b.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
}

/* ─── Indexing ───────────────────────────────────────────────────── */

/**
 * Re-chunk and re-embed a document. Replaces existing chunks atomically so a
 * failed re-index cannot leave a doc half-searchable.
 *
 * Returns the number of chunks written, or null when embedding was
 * unavailable — the caller should report that rather than claim success.
 */
export async function indexDocument(docId: string): Promise<number | null> {
    const doc = await prisma.aiKnowledgeDoc.findUnique({ where: { id: docId } });
    if (!doc) return null;

    const pieces = chunkDocument(doc.content);
    if (pieces.length === 0) {
        await prisma.aiKnowledgeChunk.deleteMany({ where: { docId } });
        return 0;
    }

    const vectors = await embed(pieces);
    if (!vectors) return null;

    await prisma.$transaction([
        prisma.aiKnowledgeChunk.deleteMany({ where: { docId } }),
        prisma.aiKnowledgeChunk.createMany({
            data: pieces.map((content, i) => ({
                docId,
                ordinal: i,
                content,
                embedding: JSON.stringify(vectors[i]),
                dims: vectors[i].length,
            })),
        }),
    ]);

    return pieces.length;
}

/* ─── Retrieval ──────────────────────────────────────────────────── */

export interface RetrievedChunk {
    docId: string;
    docTitle: string;
    docSlug: string;
    category: string;
    content: string;
    score: number;
}

/**
 * Find the passages most relevant to a question, scoped to what this role may
 * see. Falls back to a LIKE scan when embeddings are unavailable, so the
 * assistant degrades to "worse retrieval" rather than "no answer".
 */
export async function searchKnowledge(
    query: string,
    role: string,
    limit = TOP_K,
): Promise<RetrievedChunk[]> {
    const visibility = visibilitiesForRole(role);

    const chunks = await prisma.aiKnowledgeChunk.findMany({
        where: { doc: { published: true, visibility: { in: visibility } } },
        select: {
            docId: true, content: true, embedding: true,
            doc: { select: { title: true, slug: true, category: true } },
        },
        take: 2000,
    });

    if (chunks.length === 0) return [];

    const queryVec = (await embed([query]))?.[0];

    let scored: RetrievedChunk[];

    if (queryVec) {
        scored = chunks.map(c => {
            let vec: number[] = [];
            try { vec = JSON.parse(c.embedding); } catch { /* skip malformed row */ }
            return {
                docId: c.docId,
                docTitle: c.doc.title,
                docSlug: c.doc.slug,
                category: c.doc.category,
                content: c.content,
                score: vec.length ? cosine(queryVec, vec) : 0,
            };
        });
    } else {
        // Keyword fallback — crude, but better than returning nothing.
        const terms = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
        scored = chunks.map(c => {
            const hay = c.content.toLowerCase();
            const hits = terms.filter(term => hay.includes(term)).length;
            return {
                docId: c.docId,
                docTitle: c.doc.title,
                docSlug: c.doc.slug,
                category: c.doc.category,
                content: c.content,
                score: terms.length ? hits / terms.length : 0,
            };
        });
    }

    return scored
        .filter(c => c.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        // Redact before the text ever reaches a model or an MCP client.
        .map(c => ({ ...c, content: redactSecrets(c.content).text }));
}

/** Render retrieved passages as grounding context with provenance. */
export function formatContext(chunks: RetrievedChunk[]): string {
    if (chunks.length === 0) return "";
    return [
        "Retrieved documentation:",
        ...chunks.map((c, i) =>
            `[${i + 1}] ${c.docTitle} (${c.category}, relevance ${c.score.toFixed(2)})\n${c.content}`),
    ].join("\n\n");
}
