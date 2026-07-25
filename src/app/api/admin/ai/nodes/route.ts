import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { encryptNodeKey, probeNode, nodeKeyEncryptionAvailable, NO_ENCRYPTION_KEY } from "@/lib/ai-nodes";
import { audit } from "@/lib/audit";

const createSchema = z.object({
    name: z.string().trim().regex(/^[a-z0-9-]{3,40}$/, "Use lowercase letters, digits and hyphens"),
    displayName: z.string().trim().min(1).max(80),
    gpuLabel: z.string().trim().min(1).max(40),
    tier: z.enum(["STANDARD", "PREMIUM"]),
    baseUrl: z.string().trim().url().max(200),
    apiKey: z.string().trim().max(200).optional(),
    modelId: z.string().trim().min(1).max(160),
    contextLen: z.number().int().min(512).max(1_000_000).default(8192),
    maxTokens: z.number().int().min(64).max(32_000).default(2048),
    reasoningControl: z.boolean().default(false),
    active: z.boolean().default(true),
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

    const { apiKey, ...data } = parsed.data;

    if (apiKey && !nodeKeyEncryptionAvailable()) {
        return NextResponse.json({ error: NO_ENCRYPTION_KEY }, { status: 400 });
    }

    const existing = await prisma.aiNode.findUnique({ where: { name: data.name } });
    if (existing) {
        return NextResponse.json({ error: "A node with that name already exists" }, { status: 409 });
    }

    const node = await prisma.aiNode.create({
        data: { ...data, apiKey: apiKey ? encryptNodeKey(apiKey) : null },
    });

    void audit({
        userId,
        action: "ADMIN_AI_NODE_MODIFY",
        resourceType: "AiNode",
        resourceId: node.id,
        metadata: { op: "create", name: node.name, tier: node.tier },
        req,
    });

    // Probe immediately so the admin sees reachability without a second click.
    await probeNode(node).catch(() => { /* status stays false */ });

    const fresh = await prisma.aiNode.findUnique({ where: { id: node.id } });
    return NextResponse.json({ node: { ...fresh, apiKey: undefined } }, { status: 201 });
}
