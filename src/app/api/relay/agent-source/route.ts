import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { deriveAgentSecret, secretsEqual } from "../../../../../lib/relay-agent-crypto.mjs";

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
    const secret = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    // The machine has no agent yet, so it presents its static per-machine
    // secret rather than a rolling proof. Revoking that machine closes this
    // too, which is the point of moving off one shared token.
    //
    // Prisma rather than the mariadb helper server.mjs uses: Next's bundler
    // rewrites that module's createRequire("mariadb") into something broken,
    // which surfaced as a 500 reading "_.createPool is not a function".
    if (!/^[a-f0-9]{64}$/i.test(secret)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const machines = await prisma.relayAgent.findMany({
        where: { revokedAt: null },
        select: { name: true, generation: true },
    });
    const match = machines.find(m =>
        secretsEqual(secret.toLowerCase(), deriveAgentSecret(m.name, m.generation)));

    if (!match) {
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
