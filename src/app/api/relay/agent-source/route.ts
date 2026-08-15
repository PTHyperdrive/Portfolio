import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyAgentToken } from "../../../../../lib/relay-ticket.mjs";

/**
 * GET /api/relay/agent-source
 *
 * Serve the agent script so a machine can be set up without cloning the repo.
 *
 * The previous instructions began "cd relay/agent", which silently assumed the
 * whole project was already checked out on whatever box you wanted to reach.
 * On a fresh Windows workstation that is simply false, and the first command
 * failed with "The system cannot find the path specified" — an unhelpful place
 * to discover the guide had the wrong shape.
 *
 * Gated on the agent token rather than an admin session: the machine fetching
 * this has no browser session, but it does have the token it is about to
 * authenticate with. The script itself holds no secrets, so this is really
 * about not leaving an open file endpoint rather than protecting the contents.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const header = req.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!verifyAgentToken(token)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const source = await readFile(
            join(process.cwd(), "relay", "agent", "claude-relay.mjs"),
            "utf8",
        );
        return new NextResponse(source, {
            headers: {
                "Content-Type": "text/javascript; charset=utf-8",
                "Cache-Control": "no-store",
                "Content-Disposition": 'attachment; filename="claude-relay.mjs"',
            },
        });
    } catch {
        return NextResponse.json(
            { error: "Agent source is not present in this deployment." },
            { status: 500 },
        );
    }
}
