import crypto from "crypto";

/** Default Anthropic / Claude Code OAuth client id */
export const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const CLAUDE_OAUTH_AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
export const CLAUDE_OAUTH_TOKEN_URL = "https://api.anthropic.com/v1/oauth/tokens";
export const CLAUDE_OAUTH_REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";

export interface PKCEPair {
    codeVerifier: string;
    codeChallenge: string;
}

/**
 * Whether a stored credential is a subscription token rather than an API key.
 *
 * The two authenticate differently — subscription tokens go out as
 * `Authorization: Bearer`, API keys as `x-api-key` — so this decides which
 * header the SDK is configured to send. Defined here so the adapter and the
 * refresh path cannot drift apart on what counts as a subscription.
 */
export function isSubscriptionToken(key: string): boolean {
    const k = key.trim();
    return (
        k.startsWith("sk-ant-oat") ||
        k.startsWith("sk-ant-sid") ||
        k.toLowerCase().startsWith("bearer:") ||
        k.startsWith("eyJ") // JWT
    );
}

/** Strip an optional "bearer:" prefix from a pasted credential. */
export function normaliseToken(key: string): string {
    return key.trim().replace(/^bearer:\s*/i, "").trim();
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
    redirectUri?: string;
    codeChallenge: string;
    state: string;
}): string {
    const url = new URL(CLAUDE_OAUTH_AUTHORIZE_URL);
    url.searchParams.set("code", "true");
    url.searchParams.set("client_id", CLAUDE_OAUTH_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", params.redirectUri || CLAUDE_OAUTH_REDIRECT_URI);
    url.searchParams.set(
        "scope",
        "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload"
    );
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", params.state);
    return url.toString();
}

function findTokenInObj(obj: unknown): string | null {
    if (!obj) return null;
    if (typeof obj === "string" && (obj.startsWith("sk-ant-oat") || obj.startsWith("sk-ant-sid"))) {
        return obj;
    }
    if (typeof obj === "object") {
        const record = obj as Record<string, unknown>;
        if (typeof record.accessToken === "string" && record.accessToken.startsWith("sk-ant-")) {
            return record.accessToken;
        }
        if (typeof record.access_token === "string" && record.access_token.startsWith("sk-ant-")) {
            return record.access_token;
        }
        if (typeof record.session_key === "string" && record.session_key.startsWith("sk-ant-")) {
            return record.session_key;
        }

        for (const key of Object.keys(record)) {
            const val = findTokenInObj(record[key]);
            if (val) return val;
        }
    }
    return null;
}

/**
 * Extract authorization code or token from raw string, JSON object, full URL, or URL fragment.
 */
export function extractAuthCode(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return "";

    // Direct token string passed
    if (trimmed.startsWith("sk-ant-oat") || trimmed.startsWith("sk-ant-sid")) {
        return trimmed;
    }

    // JSON object passed
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
            const parsedJson = JSON.parse(trimmed);
            const extracted = findTokenInObj(parsedJson);
            if (extracted) return extracted;
        } catch {}
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

        // Regex search for sk-ant-oat/sid token inside pasted text/JSON
        const tokenMatch = /(sk-ant-(?:oat|sid)[A-Za-z0-9_-]+)/.exec(trimmed);
        if (tokenMatch) return tokenMatch[1];
    }

    return trimmed;
}

export interface ClaudeTokens {
    accessToken: string;
    tokenType?: string;
    /** Epoch milliseconds, when the provider told us how long the token lasts. */
    expiresAt?: number;
    /** Present only on a real OAuth grant, not on a hand-pasted token. */
    refreshToken?: string;
}

/** Shape the token endpoint's JSON into our own, whichever field names it used. */
function readTokenResponse(data: Record<string, unknown>): ClaudeTokens {
    const accessToken = (data.access_token || data.token || data.session_key) as string | undefined;
    if (!accessToken) {
        throw new Error("No access token returned by Anthropic OAuth service.");
    }
    return {
        accessToken,
        tokenType: data.token_type as string | undefined,
        expiresAt: typeof data.expires_in === "number"
            ? Date.now() + data.expires_in * 1000
            : undefined,
        refreshToken: data.refresh_token as string | undefined,
    };
}

/**
 * Exchange an OAuth authorization code for a Claude subscription token.
 *
 * A hand-pasted `sk-ant-oat…` is returned as-is with no expiry and no refresh
 * token — there is nothing to exchange. Such a node cannot self-renew, and the
 * admin panel says so rather than pretending it will keep working.
 */
export async function exchangeClaudeCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
}): Promise<ClaudeTokens> {
    const code = extractAuthCode(params.code);

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

    return readTokenResponse(data);
}

/**
 * Trade a refresh token for a fresh access token.
 *
 * Many OAuth servers rotate the refresh token on use, so the caller must
 * persist whatever comes back here rather than assuming the old one still
 * works — see ensureAnthropicToken in ai-providers.
 */
export async function refreshClaudeToken(refreshToken: string): Promise<ClaudeTokens> {
    const res = await fetch(CLAUDE_OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: CLAUDE_OAUTH_CLIENT_ID,
            refresh_token: refreshToken,
        }).toString(),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(
            data.error_description || data.error || `Token refresh failed with HTTP ${res.status}`,
        );
    }

    const tokens = readTokenResponse(data);
    // Carry the old refresh token forward when the server did not rotate it,
    // so a non-rotating provider does not lose the ability to refresh again.
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}
