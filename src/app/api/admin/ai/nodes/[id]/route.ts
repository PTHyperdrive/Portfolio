import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { encryptNodeKey, nodeKeyEncryptionAvailable, NO_ENCRYPTION_KEY } from "@/lib/ai-nodes";
import { REFRESH_COOKIE, clearOptions } from "@/lib/claude-oauth-flow";
import { PROVIDER_KINDS, PROVIDER_REQUIREMENTS } from "@/lib/ai-provider-meta";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
    displayName: z.string().trim().min(1).max(80).optional(),
    gpuLabel: z.string().trim().min(1).max(40).optional(),
    provider: z.enum(PROVIDER_KINDS).optional(),
    tier: z.enum(["STANDARD", "PREMIUM"]).optional(),
    /** "" clears the override so a hosted provider uses its own default. */
    baseUrl: z.string().trim().url().max(200).optional().or(z.literal("")),
    /** "" clears the stored key; omit to leave it untouched. */
    apiKey: z.string().trim().max(2000).nullable().optional(),
    modelId: z.string().trim().min(1).max(160).optional(),
    contextLen: z.number().int().min(512).max(2_000_000).optional(),
    maxTokens: z.number().int().min(64).max(128_000).optional(),
    reasoningControl: z.boolean().optional(),
    serverSandbox: z.boolean().optional(),
    serverWebAccess: z.boolean().optional(),
    active: z.boolean().optional(),
});

/** PATCH /api/admin/ai/nodes/[id] */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const node = await prisma.aiNode.findUnique({ where: { id } });
    if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
            { status: 400 },
        );
    }

    const { apiKey, baseUrl, ...rest } = parsed.data;

    if (apiKey && !nodeKeyEncryptionAvailable()) {
        return NextResponse.json({ error: NO_ENCRYPTION_KEY }, { status: 400 });
    }

    const nextProvider = rest.provider ?? node.provider;
    const nextBaseUrl = baseUrl === undefined ? node.baseUrl : (baseUrl || null);

    // A node on the OpenAI-compatible adapter has no default endpoint to fall
    // back on, so refuse the edit rather than saving something that will fail
    // on its next message. Same table the create route and the form read.
    if (PROVIDER_REQUIREMENTS[nextProvider].baseUrl && !nextBaseUrl) {
        return NextResponse.json(
            { error: `A ${nextProvider} node needs a base URL.` },
            { status: 400 },
        );
    }

    // A re-authentication leaves a fresh grant in an httpOnly cookie; pick it
    // up so the renewed node can keep renewing itself.
    const grant = apiKey ? await readRefreshGrant() : null;

    const updated = await prisma.aiNode.update({
        where: { id },
        data: {
            ...rest,
            ...(baseUrl === undefined ? {} : { baseUrl: nextBaseUrl }),
            ...(apiKey === undefined
                ? {}
                : { apiKey: apiKey ? encryptNodeKey(apiKey) : null }),
            // Replacing the credential invalidates whatever refresh grant and
            // expiry belonged to the old one. Clear them unless this update
            // brings a new grant of its own, or a stale refresh token would be
            // used against a credential it no longer matches.
            ...(apiKey === undefined
                ? {}
                : {
                    refreshToken: grant?.refreshToken ? encryptNodeKey(grant.refreshToken) : null,
                    tokenExpiresAt: grant?.expiresAt ? new Date(grant.expiresAt) : null,
                }),
            // A changed endpoint, provider or key invalidates the last health
            // result — leaving a stale green light is worse than "unknown".
            ...(nextBaseUrl !== node.baseUrl || nextProvider !== node.provider || apiKey !== undefined
                ? { online: false, lastError: null, lastCheckAt: null }
                : {}),
        },
    });

    void audit({
        userId,
        action: "ADMIN_AI_NODE_MODIFY",
        resourceType: "AiNode",
        resourceId: id,
        metadata: { op: "update", fields: Object.keys(parsed.data) },
        req,
    });

    const res = NextResponse.json({
        node: {
            ...updated,
            apiKey: undefined,
            refreshToken: undefined,
            canRefresh: Boolean(updated.refreshToken),
        },
    });

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

/**
 * DELETE /api/admin/ai/nodes/[id]
 *
 * Conversations survive — their nodeId is set null by the schema rather than
 * cascading, so user transcripts are never destroyed by an inventory change.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const node = await prisma.aiNode.findUnique({ where: { id } });
    if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });

    await prisma.aiNode.delete({ where: { id } });

    void audit({
        userId,
        action: "ADMIN_AI_NODE_MODIFY",
        resourceType: "AiNode",
        resourceId: id,
        metadata: { op: "delete", name: node.name },
        req,
    });

    return NextResponse.json({ ok: true });
}
