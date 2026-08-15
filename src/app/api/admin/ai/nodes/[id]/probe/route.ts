import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { adapterFor } from "@/lib/ai-providers";

/**
 * POST /api/admin/ai/nodes/[id]/probe
 *
 * Health-check one node through its own provider adapter and record the
 * result. Each adapter probes in the way that actually proves the node works:
 * LOCAL lists loaded models (and warns when the configured id is not among
 * them); hosted providers make a one-token round trip, which is the cheapest
 * proof that the key, the model id, and the network path all agree.
 *
 * Probing a hosted provider therefore costs a token or two. That is deliberate
 * — a probe that only checked reachability would go green with an invalid key.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const node = await prisma.aiNode.findUnique({ where: { id } });
    if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });

    let ok = false;
    let detail: string;
    try {
        ({ ok, detail } = await adapterFor(node.provider).probe(node));
    } catch (err) {
        // A missing API key or unconfigured baseUrl throws rather than
        // returning — report it as a failed probe, not a 500.
        detail = err instanceof Error ? err.message : "probe failed";
    }

    await prisma.aiNode.update({
        where: { id },
        data: {
            online: ok,
            lastError: ok ? null : detail,
            lastCheckAt: new Date(),
        },
    });

    return NextResponse.json({
        online: ok,
        provider: node.provider,
        detail,
        lastCheckAt: new Date().toISOString(),
    });
}
