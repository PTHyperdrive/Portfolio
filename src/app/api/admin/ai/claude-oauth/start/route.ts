import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/api-auth";
import { generatePKCE, buildClaudeAuthUrl, CLAUDE_OAUTH_REDIRECT_URI } from "@/lib/claude-oauth";
import { FLOW_COOKIE, cookieOptions } from "@/lib/claude-oauth-flow";

/**
 * POST /api/admin/ai/claude-oauth/start
 *
 * Begin the subscription login. Uses platform.claude.com/oauth/code/callback
 * so the authorization URL contains zero trace of our server domain.
 */
export async function POST(req: Request) {
    const { error } = await requireAdmin();
    if (error) return error;

    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const redirectUri = CLAUDE_OAUTH_REDIRECT_URI;

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(16).toString("hex");

    const authUrl = buildClaudeAuthUrl({ redirectUri, codeChallenge, state });

    // The browser gets the pure claude.com URL to open.
    const res = NextResponse.json({ authUrl, redirectUri });

    res.cookies.set(
        FLOW_COOKIE,
        JSON.stringify({ state, codeVerifier, redirectUri }),
        cookieOptions(protocol === "https"),
    );

    return res;
}
