import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { encryptNodeKey, nodeKeyEncryptionAvailable, NO_ENCRYPTION_KEY } from "@/lib/ai-nodes";
import { adapterFor } from "@/lib/ai-providers";
import { audit } from "@/lib/audit";

const createSchema = z.object({
    name: z.string().trim().regex(/^[a-z0-9-]{3,40}$/, "Use lowercase letters, digits and hyphens"),
    displayName: z.string().trim().min(1).max(80),
    gpuLabel: z.string().trim().min(1).max(40),
    provider: z.enum(["LOCAL", "ANTHROPIC", "GOOGLE", "OPENAI"]).default("LOCAL"),
    tier: z.enum(["STANDARD", "PREMIUM"]),
    /**
     * Required for LOCAL, where it is the only way to find the runtime.
     * Optional for hosted providers — the SDK knows its own endpoint, and this
     * is then an override for a proxy or a region-specific host.
     */
    baseUrl: z.string().trim().url().max(200).optional().or(z.literal("")),
    apiKey: z.string().trim().max(200).optional(),
    modelId: z.string().trim().min(1).max(160),
    contextLen: z.number().int().min(512).max(2_000_000).default(8192),
    maxTokens: z.number().int().min(64).max(128_000).default(2048),
    reasoningControl: z.boolean().default(false),
    serverSandbox: z.boolean().default(false),
    serverWebAccess: z.boolean().default(false),
    active: z.boolean().default(true),
}).refine(v => v.provider !== "LOCAL" || Boolean(v.baseUrl), {
    message: "A local node needs a base URL — the OpenAI-compatible endpoint, e.g. http://10.10.0.100:1234/v1",
    path: ["baseUrl"],
}).refine(v => v.provider === "LOCAL" || Boolean(v.apiKey), {
    message: "A hosted provider needs an API key.",
    path: ["apiKey"],
});

/**
 * GET /api/admin/ai/nodes
 * Full node inventory including baseUrl. Never exposed to non-admins.
 * apiKey is reported only as a boolean — the ciphertext never leaves the server.
 */
export async function GET() {
    const { error } = await requireAdmin();
    if (error) return error;

    const nodes = await prisma.aiNode.findMany({
        orderBy: [{ tier: "desc" }, { name: "asc" }],
        include: { _count: { select: { conversations: true } } },
    });

    return NextResponse.json({
        nodes: nodes.map(({ apiKey, _count, ...rest }) => ({
            ...rest,
            hasApiKey: Boolean(apiKey),
            conversationCount: _count.conversations,
        })),
    });
}

/** POST /api/admin/ai/nodes — register a new LM Studio host. */
export async function POST(req: Request) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
            { status: 400 },
        );
    }

    const { apiKey, baseUrl, ...data } = parsed.data;

    if (apiKey && !nodeKeyEncryptionAvailable()) {
        return NextResponse.json({ error: NO_ENCRYPTION_KEY }, { status: 400 });
    }

    const existing = await prisma.aiNode.findUnique({ where: { name: data.name } });
    if (existing) {
        return NextResponse.json({ error: "A node with that name already exists" }, { status: 409 });
    }

    const node = await prisma.aiNode.create({
        data: {
            ...data,
            // Store an omitted URL as null, not "". A hosted provider with an
            // empty-string baseUrl would have the SDK build requests against
            // a relative path and fail confusingly.
            baseUrl: baseUrl || null,
            apiKey: apiKey ? encryptNodeKey(apiKey) : null,
        },
    });

    void audit({
        userId,
        action: "ADMIN_AI_NODE_MODIFY",
        resourceType: "AiNode",
        resourceId: node.id,
        metadata: { op: "create", name: node.name, provider: node.provider, tier: node.tier },
        req,
    });

    // Probe immediately so the admin sees reachability without a second click.
    // Hosted providers go through their adapter — a one-token round trip that
    // proves the key works, which a reachability check would not.
    const { ok, detail } = await adapterFor(node.provider).probe(node)
        .catch(err => ({ ok: false, detail: err instanceof Error ? err.message : "probe failed" }));

    const fresh = await prisma.aiNode.update({
        where: { id: node.id },
        data: { online: ok, lastError: ok ? null : detail, lastCheckAt: new Date() },
    });

    return NextResponse.json({ node: { ...fresh, apiKey: undefined, hasApiKey: Boolean(apiKey) } }, { status: 201 });
}
