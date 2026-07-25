import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { listNodesForUser } from "@/lib/ai-nodes";

/**
 * GET /api/ai/nodes
 *
 * Inference nodes the caller may use. Regular users get STANDARD (RX 580)
 * nodes only; admins additionally get PREMIUM (RTX 2060). baseUrl and
 * apiKey are stripped server-side — see toPublicNode().
 */
export async function GET() {
    const { userId, error } = await requireUser();
    if (error) return error;

    try {
        const nodes = await listNodesForUser(userId);
        return NextResponse.json({ nodes });
    } catch (err) {
        console.error("[api/ai/nodes] list failed:", err);
        return NextResponse.json({ error: "Failed to load inference nodes" }, { status: 500 });
    }
}
