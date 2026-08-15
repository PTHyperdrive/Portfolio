import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireAdmin } from "@/lib/api-auth";
import { exchangeClaudeCode } from "@/lib/claude-oauth";
import {
    FLOW_COOKIE, REFRESH_COOKIE, cookieOptions, clearOptions, readFlowState,
} from "@/lib/claude-oauth-flow";

/**
 * POST /api/admin/ai/claude-oauth/exchange
 *
 * Swap an authorization code for a subscription token.
 *
 * The PKCE verifier and expected state come from the httpOnly cookie /start
 * set, never from the request body — a code delivered by a page that did not
 * begin this flow has no matching cookie and is refused. That closes the hole
 * where anything able to postMessage at the admin tab could make the browser
 * exchange an attacker-supplied code.
 *
 * The access token goes back to the browser because the admin form needs to
 * show it. The refresh token does not: it is put in a second httpOnly cookie
 * that the node create/update route reads, so it never enters page script.
 */

const schema = z.object({
    code: z.string().trim().min(1),
    /** Echoed back from the callback. Must match the cookie when present. */
    state: z.string().trim().optional(),
});

export async function POST(req: Request) {
    const { error } = await requireAdmin();
    if (error) return error;

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    let { code, state } = parsed.data;

    if (code.includes("#") && !code.startsWith("sk-ant-")) {
        const parts = code.split("#");
        code = parts[0].trim();
        if (!state && parts[1]) {
            state = parts[1].trim();
        }
    }

    const jar = await cookies();
    const flow = readFlowState(jar.get(FLOW_COOKIE)?.value);

    if (!flow) {
        return NextResponse.json(
            { error: "This login did not start in this browser, or it expired. Start it again." },
            { status: 400 },
        );
    }

    // Constant-time compare so a mismatch cannot be probed byte by byte.
    if (state !== undefined && !timingSafeEqual(state, flow.state)) {
        return NextResponse.json(
            { error: "Login state did not match. Start the login again." },
            { status: 400 },
        );
    }

    const secure = (req.headers.get("x-forwarded-proto") || "http") === "https";

    try {
        const tokens = await exchangeClaudeCode({
            code,
            codeVerifier: flow.codeVerifier,
            redirectUri: flow.redirectUri,
        });

        const res = NextResponse.json({
            ok: true,
            accessToken: tokens.accessToken,
            expiresAt: tokens.expiresAt ?? null,
            /** Tells the panel whether this node will be able to renew itself. */
            canRefresh: Boolean(tokens.refreshToken),
        });

        res.cookies.set(FLOW_COOKIE, "", clearOptions(secure));
        if (tokens.refreshToken) {
            res.cookies.set(
                REFRESH_COOKIE,
                JSON.stringify({
                    refreshToken: tokens.refreshToken,
                    expiresAt: tokens.expiresAt ?? null,
                }),
                cookieOptions(secure),
            );
        } else {
            // A hand-pasted token carries no refresh half; make sure a stale
            // one from an earlier attempt is not picked up by the node route.
            res.cookies.set(REFRESH_COOKIE, "", clearOptions(secure));
        }

        return res;
    } catch (err) {
        const message = err instanceof Error
            ? err.message
            : "Failed to exchange authorization code";
        // Also record it server-side: the browser shows one line, and when the
        // provider's reason is unexpected the pm2 log is where you go looking.
        // Only the failure branch reaches here, so no token is ever logged.
        console.error("[claude-oauth/exchange] token exchange failed:", message);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

/** Length-independent equality, to avoid leaking the state through timing. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
