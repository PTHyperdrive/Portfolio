import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { issueTicket, TICKET_TTL_MS } from "../../../../../../lib/relay-ticket.mjs";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/relay/ticket
 *
 * Mint a short-lived ticket the browser puts in the relay WebSocket URL. This
 * route is where the admin check actually happens — the socket server only
 * verifies the signature, so this is the single gate on who may attach to a
 * Claude Code session.
 *
 * Every issue is audited. A terminal attached to the operator's own machine is
 * the most privileged surface on the platform, and "who opened it, when" is
 * worth being able to answer later.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    if (!process.env.RELAY_AGENT_TOKEN) {
        return NextResponse.json(
            { error: "RELAY_AGENT_TOKEN is not configured, so no agent can connect. See relay/README.md." },
            { status: 503 },
        );
    }

    let ticket: string;
    try {
        ticket = issueTicket(userId);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Could not issue a relay ticket." },
            { status: 500 },
        );
    }

    void audit({
        userId,
        action: "ADMIN_RELAY_ATTACH",
        resourceType: "Relay",
        metadata: { ttlMs: TICKET_TTL_MS },
        req,
    });

    return NextResponse.json({ ticket, expiresInMs: TICKET_TTL_MS });
}
