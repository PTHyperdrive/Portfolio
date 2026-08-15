import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { listNodesForUser } from "@/lib/ai-nodes";

/**
 * GET /api/ai/nodes
 *
 * Inference nodes the caller may use. Regular users get STANDARD (RX 580)
 * nodes only; admins additionally get PREMIUM (RTX 2060) and the hosted
 * providers. baseUrl and apiKey are stripped server-side — see toPublicNode().
 *
 * `isAdmin` rides along so the Studio can show admin-only affordances (sharing
 * a skill with every user) without a second round trip. It is a display hint
 * only — every privileged action is re-checked against the database on its own
 * route, so a client that lies about it gains nothing.
 */
export async function GET() {
    const { userId, error } = await requireUser();
    if (error) return error;

    try {
        const [nodes, user] = await Promise.all([
            listNodesForUser(userId),
            prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
        ]);
        return NextResponse.json({ nodes, isAdmin: user?.role === "ADMIN" });
    } catch (err) {
        console.error("[api/ai/nodes] list failed:", err);
        return NextResponse.json({ error: "Failed to load inference nodes" }, { status: 500 });
    }
}
