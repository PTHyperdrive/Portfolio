import crypto from "crypto";

/** Anthropic / Claude Code OAuth client id — configurable via process.env.CLAUDE_OAUTH_CLIENT_ID */
export const CLAUDE_OAUTH_CLIENT_ID =
    process.env.CLAUDE_OAUTH_CLIENT_ID || "9d146985-0553-4882-a7f2-63234509e530";
export const CLAUDE_OAUTH_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
export const CLAUDE_OAUTH_TOKEN_URL = "https://api.anthropic.com/v1/oauth/tokens";

export interface PKCEPair {
    codeVerifier: string;
    codeChallenge: string;
}

function base64UrlEncode(buffer: Buffer): string {
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

export function generatePKCE(): PKCEPair {
    const verifierBuffer = crypto.randomBytes(32);
    const codeVerifier = base64UrlEncode(verifierBuffer);
    const hash = crypto.createHash("sha256").update(codeVerifier).digest();
    const codeChallenge = base64UrlEncode(hash);
    return { codeVerifier, codeChallenge };
}

export function buildClaudeAuthUrl(params: {
    redirectUri: string;
    codeChallenge: string;
    state: string;
}): string {
    const url = new URL(CLAUDE_OAUTH_AUTHORIZE_URL);
    url.searchParams.set("client_id", CLAUDE_OAUTH_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("scope", "user:inference");
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", params.state);
    return url.toString();
}

/**
 * Extract authorization code from raw string, full URL, or URL fragment.
 */
export function extractAuthCode(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return "";

    // Direct token string passed
    if (trimmed.startsWith("sk-ant-oat") || trimmed.startsWith("sk-ant-sid")) {
        return trimmed;
    }

    try {
        // Try parsing as URL
        const parsed = new URL(trimmed);
        const code = parsed.searchParams.get("code");
        if (code) return code;
    } catch {
        // Search regex pattern for code parameter
        const match = /[?&#]code=([A-Za-z0-9._-]+)/.exec(trimmed);
        if (match) return match[1];
    }

    return trimmed;
}

/**
 * Exchange an OAuth authorization code for a Claude Subscription Token (sk-ant-oat...).
 */
export async function exchangeClaudeCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
}): Promise<{ accessToken: string; tokenType?: string; expiresAt?: number }> {
    const code = extractAuthCode(params.code);

    // If user already pasted a valid subscription token, return it directly
    if (code.startsWith("sk-ant-oat") || code.startsWith("sk-ant-sid")) {
        return { accessToken: code };
    }

    const res = await fetch(CLAUDE_OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: CLAUDE_OAUTH_CLIENT_ID,
            code,
            redirect_uri: params.redirectUri,
            code_verifier: params.codeVerifier,
        }).toString(),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(
            data.error_description || data.error || `Token exchange failed with HTTP ${res.status}`,
        );
    }

    const accessToken = data.access_token || data.token || data.session_key;
    if (!accessToken) {
        throw new Error("No access token returned by Anthropic OAuth service.");
    }

    return {
        accessToken,
        tokenType: data.token_type,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    };
}
