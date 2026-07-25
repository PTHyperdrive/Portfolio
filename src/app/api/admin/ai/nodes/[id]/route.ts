import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { encryptNodeKey, nodeKeyEncryptionAvailable, NO_ENCRYPTION_KEY } from "@/lib/ai-nodes";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
    displayName: z.string().trim().min(1).max(80).optional(),
    gpuLabel: z.string().trim().min(1).max(40).optional(),
    tier: z.enum(["STANDARD", "PREMIUM"]).optional(),
    baseUrl: z.string().trim().url().max(200).optional(),
    /** "" clears the stored key; omit to leave it untouched. */
    apiKey: z.string().trim().max(200).nullable().optional(),
    modelId: z.string().trim().min(1).max(160).optional(),
    contextLen: z.number().int().min(512).max(1_000_000).optional(),
    maxTokens: z.number().int().min(64).max(32_000).optional(),
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

    const { apiKey, ...rest } = parsed.data;

    if (apiKey && !nodeKeyEncryptionAvailable()) {
        return NextResponse.json({ error: NO_ENCRYPTION_KEY }, { status: 400 });
    }

    const updated = await prisma.aiNode.update({
        where: { id },
        data: {
            ...rest,
            ...(apiKey === undefined
                ? {}
                : { apiKey: apiKey ? encryptNodeKey(apiKey) : null }),
            // A changed endpoint invalidates the last health result.
            ...(rest.baseUrl && rest.baseUrl !== node.baseUrl
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

    return NextResponse.json({ node: { ...updated, apiKey: undefined } });
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
