import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { deriveAgentSecret } from "../../../../../../lib/relay-agent-crypto.mjs";
import { audit } from "@/lib/audit";

/**
 * /api/admin/relay/agents — one credential per machine
 *
 * Replaces the single shared token. Each machine gets its own secret, so a
 * leak names which box leaked it and revoking one leaves the others running.
 *
 * The secret is derived from the server master secret, the name and the
 * generation, so nothing is stored and it can be shown again later. Rotation
 * bumps the generation, which retires the previous secret permanently.
 */

export const dynamic = "force-dynamic";

const createSchema = z.object({
    name: z.string().trim().regex(
        /^[\w.@-]{1,60}$/,
        "Use letters, digits, dot, dash, underscore or @ — this is how the machine appears in the picker",
    ),
});

export async function GET() {
    const { error } = await requireAdmin();
    if (error) return error;

    const agents = await prisma.relayAgent.findMany({
        orderBy: [{ revokedAt: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({
        agents: agents.map(a => ({
            id: a.id,
            name: a.name,
            generation: a.generation,
            counter: a.counter,
            revoked: Boolean(a.revokedAt),
            revokedAt: a.revokedAt,
            lastSeenAt: a.lastSeenAt,
            lastIp: a.lastIp,
            createdAt: a.createdAt,
            // Derived, not stored — safe to show an admin on request.
            secret: a.revokedAt ? null : deriveAgentSecret(a.name, a.generation),
        })),
    });
}

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
    const { name } = parsed.data;

    const existing = await prisma.relayAgent.findUnique({ where: { name } });
    if (existing) {
        return NextResponse.json(
            { error: `A machine named "${name}" already exists. Rotate it instead of creating a second.` },
            { status: 409 },
        );
    }

    const agent = await prisma.relayAgent.create({ data: { name } });

    void audit({
        userId,
        action: "ADMIN_RELAY_AGENT_MODIFY",
        resourceType: "RelayAgent",
        resourceId: agent.id,
        metadata: { op: "create", name },
        req,
    });

    return NextResponse.json({
        agent: {
            id: agent.id,
            name: agent.name,
            generation: agent.generation,
            secret: deriveAgentSecret(agent.name, agent.generation),
        },
    }, { status: 201 });
}
