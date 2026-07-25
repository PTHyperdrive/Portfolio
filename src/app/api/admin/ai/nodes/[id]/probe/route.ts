import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { probeNode, decryptNodeKey } from "@/lib/ai-nodes";

/**
 * POST /api/admin/ai/nodes/[id]/probe
 *
 * Health-check one host and report the models LM Studio currently has loaded,
 * so an admin can confirm the configured modelId matches reality.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const node = await prisma.aiNode.findUnique({ where: { id } });
    if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });

    const online = await probeNode(node);

    let loadedModels: string[] = [];
    if (online) {
        try {
            const apiKey = decryptNodeKey(node.apiKey);
            const res = await fetch(`${node.baseUrl.replace(/\/$/, "")}/models`, {
                headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
                signal: AbortSignal.timeout(4000),
            });
            if (res.ok) {
                const body = await res.json();
                loadedModels = (body?.data ?? [])
                    .map((m: { id?: string }) => m.id)
                    .filter((v: unknown): v is string => typeof v === "string");
            }
        } catch {
            // Reachable but model listing failed — report online with no list.
        }
    }

    const fresh = await prisma.aiNode.findUnique({
        where: { id },
        select: { online: true, lastError: true, lastCheckAt: true },
    });

    return NextResponse.json({
        online,
        loadedModels,
        modelMatches: loadedModels.length === 0 || loadedModels.includes(node.modelId),
        lastError: fresh?.lastError ?? null,
        lastCheckAt: fresh?.lastCheckAt ?? null,
    });
}
