import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

/**
 * GET /api/admin/relay/token
 *
 * Return the agent token so the setup snippet can be handed over complete.
 *
 * The panel previously printed a PASTE_RELAY_AGENT_TOKEN placeholder, on the
 * reasoning that a secret on screen ends up in screenshots. In practice that
 * traded one small risk for a much likelier failure: the placeholder gets
 * copied verbatim, the download returns 401, curl writes the error body to the
 * file, and node reports a syntax error in what looks like the agent. The
 * secret is worth protecting from a shoulder, not from the administrator who
 * can read it out of .env over SSH anyway.
 *
 * So it stays hidden until asked for, and is fetched rather than embedded in
 * the page — a server-rendered secret would sit in the HTML whether or not it
 * was ever revealed.
 */

export const dynamic = "force-dynamic";

export async function GET() {
    const { error } = await requireAdmin();
    if (error) return error;

    const token = process.env.RELAY_AGENT_TOKEN;
    if (!token) {
        return NextResponse.json(
            { error: "RELAY_AGENT_TOKEN is not set on the server. See relay/README.md." },
            { status: 503 },
        );
    }

    return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
