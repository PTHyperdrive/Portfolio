import crypto from "crypto";

/** Default Anthropic / Claude Code OAuth client id */
export const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const CLAUDE_OAUTH_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
export const CLAUDE_OAUTH_TOKEN_URL = "https://console.anthropic.com/v1/oauth/tokens";
export const CLAUDE_OAUTH_REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";

const CLAUDE_TOKEN_ENDPOINTS = [
    "https://platform.claude.com/v1/oauth/token",
    "https://platform.claude.com/oauth/token",
    "https://console.anthropic.com/v1/oauth/tokens",
    "https://console.anthropic.com/v1/oauth/token",
    "https://api.anthropic.com/v1/oauth/tokens",
    "https://api.anthropic.com/v1/oauth/token",
];

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
 * Supports code#state format (e.g., ZECJ496LUiUG2FQ21nxx...#fecf38a1aa...).
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
        if (code) return code.split("#")[0].trim();
    } catch {
        // Search regex pattern for code parameter
        const match = /[?&#]code=([A-Za-z0-9._-]+)/.exec(trimmed);
        if (match) return match[1].split("#")[0].trim();

        // Regex search for sk-ant-oat/sid token inside pasted text/JSON
        const tokenMatch = /(sk-ant-(?:oat|sid)[A-Za-z0-9_-]+)/.exec(trimmed);
        if (tokenMatch) return tokenMatch[1];
    }

    // If input is code#state (e.g. ZECJ496LUiUG2FQ21nxx...#fecf38a1aa...)
    if (trimmed.includes("#") && !trimmed.startsWith("sk-ant-")) {
        return trimmed.split("#")[0].trim();
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

function formatOAuthErrorMessage(data: Record<string, unknown>, fallbackStatus: number): string {
    if (typeof data.error_description === "string" && data.error_description) {
        return data.error_description;
    }
    if (typeof data.error === "string" && data.error) {
        return data.error;
    }
    if (data.error && typeof data.error === "object") {
        const errObj = data.error as Record<string, unknown>;
        if (typeof errObj.message === "string" && errObj.message) {
            return errObj.message;
        }
        return JSON.stringify(errObj);
    }
    if (typeof data.message === "string" && data.message) {
        return data.message;
    }
    return `OAuth request failed with HTTP ${fallbackStatus}`;
}

/**
 * Exchange an OAuth authorization code for a Claude subscription token.
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

    let lastError: Error | null = null;

    for (const endpoint of CLAUDE_TOKEN_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                    "User-Agent": "Claude-Code/0.2.29",
                },
                body: new URLSearchParams({
                    grant_type: "authorization_code",
                    client_id: CLAUDE_OAUTH_CLIENT_ID,
                    code,
                    redirect_uri: params.redirectUri,
                    code_verifier: params.codeVerifier,
                }).toString(),
            });

            if (res.status === 404 || res.status === 403) continue;

            const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

            if (!res.ok) {
                throw new Error(formatOAuthErrorMessage(data, res.status));
            }

            return readTokenResponse(data);
        } catch (err) {
            if (err instanceof Error && (err.message.includes("404") || err.message.includes("403"))) continue;
            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }

    throw lastError || new Error("OAuth token exchange failed across all endpoints. Verify authorization code.");
}

/**
 * Trade a refresh token for a fresh access token.
 */
export async function refreshClaudeToken(refreshToken: string): Promise<ClaudeTokens> {
    let lastError: Error | null = null;

    for (const endpoint of CLAUDE_TOKEN_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                    "User-Agent": "Claude-Code/0.2.29",
                },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    client_id: CLAUDE_OAUTH_CLIENT_ID,
                    refresh_token: refreshToken,
                }).toString(),
            });

            if (res.status === 404 || res.status === 403) continue;

            const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

            if (!res.ok) {
                throw new Error(formatOAuthErrorMessage(data, res.status));
            }

            const tokens = readTokenResponse(data);
            return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
        } catch (err) {
            if (err instanceof Error && (err.message.includes("404") || err.message.includes("403"))) continue;
            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }

    throw lastError || new Error("OAuth refresh token endpoint returned HTTP error.");
}
