import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { deriveAgentSecret } from "../../../../../../../lib/relay-agent-auth.mjs";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
    /** "rotate" issues a new secret; "revoke" and "restore" flip access. */
    action: z.enum(["rotate", "revoke", "restore"]),
});

/**
 * PATCH /api/admin/relay/agents/[id]
 *
 * Rotate retires the old secret by bumping the generation — the previous one
 * stops verifying immediately and cannot be recovered. It also resets the
 * rolling counter, because the new secret has its own sequence and the agent
 * starts counting again from zero.
 *
 * Revoke is reversible and keeps the row, so the audit trail and the last-seen
 * address survive. A revoked machine cannot connect or download the agent.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const agent = await prisma.relayAgent.findUnique({ where: { id } });
    if (!agent) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { action } = parsed.data;

    const updated = await prisma.relayAgent.update({
        where: { id },
        data: action === "rotate"
            ? { generation: { increment: 1 }, counter: 0 }
            : action === "revoke"
                ? { revokedAt: new Date() }
                : { revokedAt: null },
    });

    void audit({
        userId,
        action: "ADMIN_RELAY_AGENT_MODIFY",
        resourceType: "RelayAgent",
        resourceId: id,
        metadata: { op: action, name: agent.name, generation: updated.generation },
        req,
    });

    return NextResponse.json({
        agent: {
            id: updated.id,
            name: updated.name,
            generation: updated.generation,
            counter: updated.counter,
            revoked: Boolean(updated.revokedAt),
            secret: updated.revokedAt ? null : deriveAgentSecret(updated.name, updated.generation),
        },
    });
}

/** DELETE — remove the machine entirely. Revoke is usually the better choice. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const agent = await prisma.relayAgent.findUnique({ where: { id } });
    if (!agent) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

    await prisma.relayAgent.delete({ where: { id } });

    void audit({
        userId,
        action: "ADMIN_RELAY_AGENT_MODIFY",
        resourceType: "RelayAgent",
        resourceId: id,
        metadata: { op: "delete", name: agent.name },
        req,
    });

    return NextResponse.json({ ok: true });
}
