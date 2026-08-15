import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { encryptNodeKey, nodeKeyEncryptionAvailable, NO_ENCRYPTION_KEY } from "@/lib/ai-nodes";
import { adapterFor } from "@/lib/ai-providers";
import { REFRESH_COOKIE, clearOptions } from "@/lib/claude-oauth-flow";
import { PROVIDER_KINDS, PROVIDER_REQUIREMENTS } from "@/lib/ai-provider-meta";
import { audit } from "@/lib/audit";

const createSchema = z.object({
    name: z.string().trim().regex(/^[a-z0-9-]{3,40}$/, "Use lowercase letters, digits and hyphens"),
    displayName: z.string().trim().min(1).max(80),
    gpuLabel: z.string().trim().min(1).max(40),
    provider: z.enum(PROVIDER_KINDS).default("LOCAL"),
    tier: z.enum(["STANDARD", "PREMIUM"]),
    /**
     * Required for LOCAL, where it is the only way to find the runtime.
     * Optional for hosted providers — the SDK knows its own endpoint, and this
     * is then an override for a proxy or a region-specific host.
     */
    baseUrl: z.string().trim().url().max(200).optional().or(z.literal("")),
    apiKey: z.string().trim().max(2000).optional(),
    modelId: z.string().trim().min(1).max(160),
    contextLen: z.number().int().min(512).max(2_000_000).default(8192),
    maxTokens: z.number().int().min(64).max(128_000).default(2048),
    reasoningControl: z.boolean().default(false),
    serverSandbox: z.boolean().default(false),
    serverWebAccess: z.boolean().default(false),
    active: z.boolean().default(true),
}).refine(v => !PROVIDER_REQUIREMENTS[v.provider].baseUrl || Boolean(v.baseUrl), {
    message:
        "This provider needs a base URL — the OpenAI-compatible endpoint. " +
        "Local: http://10.10.0.100:1234/v1 · DeepSeek: https://api.deepseek.com/v1",
    path: ["baseUrl"],
}).refine(v => !PROVIDER_REQUIREMENTS[v.provider].apiKey || Boolean(v.apiKey), {
    message: "This provider needs an API key.",
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
        // refreshToken is destructured out and never returned. It mints new
        // access tokens indefinitely, so it stays server-side even for an
        // admin — only whether one exists is reported.
        nodes: nodes.map(({ apiKey, refreshToken, _count, ...rest }) => ({
            ...rest,
            hasApiKey: Boolean(apiKey),
            canRefresh: Boolean(refreshToken),
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

    // Pick up the refresh token the OAuth exchange stashed in an httpOnly
    // cookie, so a subscription node can renew itself later. Absent for API
    // keys and hand-pasted tokens, which is why it is optional here.
    const grant = await readRefreshGrant();

    const node = await prisma.aiNode.create({
        data: {
            ...data,
            // Store an omitted URL as null, not "". A hosted provider with an
            // empty-string baseUrl would have the SDK build requests against
            // a relative path and fail confusingly.
            baseUrl: baseUrl || null,
            apiKey: apiKey ? encryptNodeKey(apiKey) : null,
            ...(grant?.refreshToken
                ? { refreshToken: encryptNodeKey(grant.refreshToken) }
                : {}),
            ...(grant?.expiresAt ? { tokenExpiresAt: new Date(grant.expiresAt) } : {}),
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

    const res = NextResponse.json(
        {
            node: {
                ...fresh,
                apiKey: undefined,
                refreshToken: undefined,
                hasApiKey: Boolean(apiKey),
                canRefresh: Boolean(fresh.refreshToken),
            },
        },
        { status: 201 },
    );

    // The grant has been persisted against the node; the cookie has no further
    // purpose and should not linger to be attached to a later node.
    if (grant) {
        res.cookies.set(
            REFRESH_COOKIE, "",
            clearOptions((req.headers.get("x-forwarded-proto") || "http") === "https"),
        );
    }

    return res;
}

/** Read and parse the refresh grant the OAuth exchange left in a cookie. */
async function readRefreshGrant(): Promise<{ refreshToken: string; expiresAt: number | null } | null> {
    const raw = (await cookies()).get(REFRESH_COOKIE)?.value;
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed?.refreshToken === "string" ? parsed : null;
    } catch {
        return null;
    }
}
