import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { resolveNodeForUser } from "@/lib/ai-nodes";
import { adapterFor, isChatModel } from "@/lib/ai-providers";

/**
 * GET /api/ai/nodes/[id]/models
 *
 * Models the node is serving right now, asked of the provider rather than read
 * from configuration. One LM Studio host commonly has several loaded at once,
 * and an operator who loads another should not also have to remember to tell
 * the platform about it.
 *
 * Tier-gated through resolveNodeForUser, so this cannot be used to enumerate
 * what an admin-only node is running.
 */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const { id } = await params;
    const { node, error: nodeErr } = await resolveNodeForUser(userId, id);

    if (nodeErr === "FORBIDDEN") {
        return NextResponse.json(
            { error: "This model runs on hardware reserved for administrators." },
            { status: 403 },
        );
    }
    if (nodeErr || !node) {
        return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    try {
        const all = await adapterFor(node.provider).listModels(node);
        // Embedding models cannot chat; offering one only yields a confusing
        // failure several seconds later.
        const models = all.filter(isChatModel);

        return NextResponse.json({
            models,
            // The configured default, so the picker can mark it even when the
            // host has since been loaded with others.
            defaultModelId: node.modelId,
        });
    } catch (err) {
        return NextResponse.json(
            {
                error: err instanceof Error
                    ? err.message
                    : `Could not list models on ${node.displayName}.`,
            },
            { status: 502 },
        );
    }
}
