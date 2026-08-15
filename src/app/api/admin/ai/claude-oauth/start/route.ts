import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/api-auth";
import { generatePKCE, buildClaudeAuthUrl } from "@/lib/claude-oauth";
import { FLOW_COOKIE, cookieOptions } from "@/lib/claude-oauth-flow";

/**
 * POST /api/admin/ai/claude-oauth/start
 *
 * Begin the subscription login. The PKCE verifier and the CSRF state are put
 * in an httpOnly cookie rather than handed to the browser: script on the page
 * never needs them, and the exchange trusts the cookie instead of whatever the
 * client posts back. That is what makes the state check meaningful — a value
 * the caller supplies and also validates protects nothing.
 */
export async function POST(req: Request) {
    const { error } = await requireAdmin();
    if (error) return error;

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const redirectUri = `${protocol}://${host}/api/admin/ai/claude-oauth/callback`;

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(16).toString("hex");

    const authUrl = buildClaudeAuthUrl({ redirectUri, codeChallenge, state });

    // The browser gets the URL to open and nothing else of consequence.
    const res = NextResponse.json({ authUrl, redirectUri });

    res.cookies.set(
        FLOW_COOKIE,
        JSON.stringify({ state, codeVerifier, redirectUri }),
        cookieOptions(protocol === "https"),
    );

    return res;
}
