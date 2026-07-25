import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { toolsForRole, executeTool } from "@/lib/ai-tools";

/**
 * POST /api/ai/mcp — MCP over HTTP for signed-in platform users
 *
 * The tenant-facing half of the two-surface split described in
 * mcp/notrespond-mcp/README.md. Authentication is the caller's session and
 * the role comes from the database, so this surface can never serve the
 * operator toolset even if a caller crafts the request by hand: tool
 * visibility and execution are both filtered by the real role.
 *
 * Method coverage is deliberately minimal — initialize, tools/list,
 * tools/call, ping. No resources, no prompts, no sampling. Sampling in
 * particular would let a client drive the model through this endpoint, which
 * is not something a tenant surface should offer.
 */

const rpcSchema = z.object({
    jsonrpc: z.literal("2.0").optional(),
    id: z.union([z.string(), z.number()]).nullable().optional(),
    method: z.string().min(1).max(64),
    params: z.record(z.string(), z.unknown()).optional(),
});

const PROTOCOL_VERSION = "2024-11-05";

function result(id: string | number | null | undefined, payload: unknown) {
    return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: payload });
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
    return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

export async function POST(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const parsed = rpcSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return rpcError(null, -32700, "Parse error");
    }

    const { id, method, params } = parsed.data;

    // Role is read per request rather than trusted from the session, so a
    // demotion takes effect on the next call rather than the next login.
    const role = (await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    }))?.role ?? "USER";

    switch (method) {
        case "initialize":
            return result(id, {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: { name: "notrespond-web", version: "1.0.0" },
            });

        case "ping":
            return result(id, {});

        case "tools/list":
            return result(id, {
                tools: toolsForRole(role).map(t => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.parameters,
                })),
            });

        case "tools/call": {
            const name = typeof params?.name === "string" ? params.name : "";
            if (!name) return rpcError(id, -32602, "Missing tool name");

            const args = (params?.arguments ?? {}) as Record<string, unknown>;

            // executeTool owns the tier gate, redaction, framing and audit —
            // this handler deliberately does none of that itself so the two
            // MCP surfaces cannot drift apart.
            const outcome = await executeTool(name, args, { userId, role }, req);

            return result(id, {
                content: [{ type: "text", text: outcome.text }],
                ...(outcome.ok ? {} : { isError: true }),
            });
        }

        default:
            return rpcError(id, -32601, `Method not found: ${method}`);
    }
}
