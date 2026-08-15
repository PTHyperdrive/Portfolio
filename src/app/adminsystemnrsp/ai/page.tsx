"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Bot, Plus, RefreshCw, Trash2, Circle, Lock, Users,
    AlertTriangle, Check, X, Server, Cloud, ExternalLink, Sparkles, Clock,
} from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";

type Provider = "LOCAL" | "ANTHROPIC" | "GOOGLE" | "OPENAI";
type Tier = "STANDARD" | "PREMIUM";

interface AdminNode {
    id: string;
    name: string;
    displayName: string;
    gpuLabel: string;
    provider: Provider;
    tier: Tier;
    /** Null on hosted providers using the vendor's own endpoint. */
    baseUrl: string | null;
    modelId: string;
    contextLen: number;
    maxTokens: number;
    reasoningControl: boolean;
    serverSandbox: boolean;
    serverWebAccess: boolean;
    active: boolean;
    online: boolean;
    lastError: string | null;
    lastCheckAt: string | null;
    hasApiKey: boolean;
    /** True when a refresh token is stored, so the node can renew itself. */
    canRefresh: boolean;
    /** Expiry of a subscription token. Null for API keys, which do not expire. */
    tokenExpiresAt: string | null;
    conversationCount: number;
}

/** What the probe route returns — one line of truth per provider. */
interface ProbeResult {
    online: boolean;
    provider: Provider;
    detail: string;
}

interface NodeForm {
    name: string;
    displayName: string;
    gpuLabel: string;
    provider: Provider;
    tier: Tier;
    baseUrl: string;
    apiKey: string;
    modelId: string;
    contextLen: number;
    maxTokens: number;
    reasoningControl: boolean;
    serverSandbox: boolean;
    serverWebAccess: boolean;
}

const BLANK: NodeForm = {
    name: "",
    displayName: "",
    gpuLabel: "",
    provider: "LOCAL",
    tier: "STANDARD",
    baseUrl: "",
    apiKey: "",
    modelId: "",
    contextLen: 8192,
    maxTokens: 2048,
    reasoningControl: false,
    serverSandbox: false,
    serverWebAccess: false,
};

/**
 * Sensible starting points per provider.
 *
 * Hosted providers default to PREMIUM: they bill per token against the
 * operator's own account, so opening one to every signed-in user should be a
 * deliberate act, not the default that comes with picking Claude in a dropdown.
 *
 * The model ids are prefilled rather than left blank because the probe verifies
 * them with a one-token round trip the moment the node is created — a wrong id
 * is reported in seconds, which beats an empty field the admin has to go and
 * look up.
 */
const PRESETS: Record<Provider, Partial<NodeForm>> = {
    LOCAL: {
        gpuLabel: "", tier: "STANDARD", contextLen: 8192, maxTokens: 2048,
        reasoningControl: false, serverSandbox: false, serverWebAccess: false,
    },
    ANTHROPIC: {
        gpuLabel: "Anthropic", tier: "PREMIUM",
        displayName: "Claude Opus 5", modelId: "claude-opus-5",
        contextLen: 200_000, maxTokens: 16_000, reasoningControl: true,
    },
    GOOGLE: {
        gpuLabel: "Google", tier: "PREMIUM",
        displayName: "Gemini 2.5 Pro", modelId: "gemini-2.5-pro",
        contextLen: 200_000, maxTokens: 16_000, reasoningControl: false,
    },
    OPENAI: {
        gpuLabel: "OpenAI", tier: "PREMIUM",
        displayName: "GPT", modelId: "",
        contextLen: 128_000, maxTokens: 8_000, reasoningControl: true,
    },
};

const PROVIDER_LABEL: Record<Provider, string> = {
    LOCAL: "Local — LM Studio / vLLM / Ollama",
    ANTHROPIC: "Anthropic — Claude",
    GOOGLE: "Google — Gemini",
    OPENAI: "OpenAI-compatible",
};

/**
 * Turn whatever an API returned in `error` into something a human can read.
 *
 * Anthropic reports failures as `{"error": {"type": …, "message": …}}`, so the
 * obvious `new Error(data.error)` renders the useless string "[object Object]".
 * Every error path in this page goes through here so that cannot come back:
 * a string is used as-is, an object gives up its `message`, and anything else
 * is serialised rather than coerced.
 */
function errorText(value: unknown, fallback: string): string {
    if (typeof value === "string" && value.trim()) return value;

    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const field of ["message", "error_description", "detail"]) {
            if (typeof record[field] === "string" && record[field]) return record[field] as string;
        }
        // A nested { error: { message } }, which is Anthropic's shape.
        if (record.error) return errorText(record.error, fallback);
        try {
            const json = JSON.stringify(value);
            if (json && json !== "{}") return json;
        } catch {
            // Circular or otherwise unserialisable — fall through.
        }
    }

    return fallback;
}

export default function AdminAiNodesPage() {
    const t = useThemeTokens();

    const [nodes, setNodes] = useState<AdminNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(BLANK);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [probing, setProbing] = useState<string | null>(null);
    const [probes, setProbes] = useState<Record<string, ProbeResult>>({});
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const [oauthLoading, setOauthLoading] = useState(false);
    const [oauthModal, setOauthModal] = useState(false);
    const [pastedCode, setPastedCode] = useState("");
    const [oauthSuccess, setOauthSuccess] = useState<string | null>(null);
    const [oauthError, setOauthError] = useState<string | null>(null);

    /**
     * Swap the authorization code for a token.
     *
     * The PKCE verifier and redirect URI are no longer sent from here — the
     * server keeps them in an httpOnly cookie from the moment the login starts,
     * so a code that did not originate in this browser has nothing to pair with.
     */
    const exchangeClaudeCode = useCallback(async (code: string, state?: string) => {
        setOauthLoading(true);
        setOauthError(null);
        try {
            const res = await fetch("/api/admin/ai/claude-oauth/exchange", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, state }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(errorText(data.error, "Failed to exchange code"));

            setForm(f => ({ ...f, apiKey: data.accessToken }));
            setOauthSuccess(
                data.canRefresh
                    ? "Subscription token applied. It will renew itself automatically."
                    : "Token applied. It cannot renew itself — you will have to re-authenticate when it expires.",
            );
            setTimeout(() => {
                setOauthModal(false);
                setOauthSuccess(null);
            }, 2400);
        } catch (err) {
            setOauthError(err instanceof Error ? err.message : "Extraction failed");
        } finally {
            setOauthLoading(false);
        }
    }, []);

    useEffect(() => {
        const handleMessage = (e: MessageEvent) => {
            // Only this deployment's own callback page may drive the exchange.
            // Without this check any page able to postMessage at this tab could
            // feed in a code of its choosing and have the browser redeem it.
            if (e.origin !== window.location.origin) return;
            if (e.data?.type !== "CLAUDE_OAUTH_RESPONSE") return;

            if (e.data.code) {
                void exchangeClaudeCode(e.data.code, e.data.state ?? undefined);
            } else if (e.data.error) {
                setOauthError(errorText(e.data.error, "Login failed"));
            }
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [exchangeClaudeCode]);

    const startClaudeOAuth = async () => {
        setOauthLoading(true);
        setOauthError(null);
        setPastedCode("");
        try {
            const res = await fetch("/api/admin/ai/claude-oauth/start", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(errorText(data.error, "Failed to initialize login"));

            setOauthModal(true);

            const width = 600;
            const height = 700;
            const left = window.screenX + (window.innerWidth - width) / 2;
            const top = window.screenY + (window.innerHeight - height) / 2;
            window.open(
                data.authUrl,
                "ClaudeSubscriptionLogin",
                `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`,
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to open Claude login");
        } finally {
            setOauthLoading(false);
        }
    };

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/ai/nodes");
            if (!res.ok) throw new Error("Failed to load nodes");
            const data = await res.json();
            setNodes(data.nodes);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load nodes");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    /** Switching provider re-seeds the fields that are provider-specific. */
    const pickProvider = (provider: Provider) => {
        setForm(f => ({ ...f, provider, ...PRESETS[provider] }));
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/ai/nodes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    apiKey: form.apiKey || undefined,
                    baseUrl: form.baseUrl || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(errorText(data.error, "Failed to create node"));
            setForm(BLANK);
            setShowForm(false);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create node");
        } finally {
            setSaving(false);
        }
    };

    const probe = async (id: string) => {
        setProbing(id);
        try {
            const res = await fetch(`/api/admin/ai/nodes/${id}/probe`, { method: "POST" });
            if (res.ok) {
                const result: ProbeResult = await res.json();
                setProbes(prev => ({ ...prev, [id]: result }));
                load();
            }
        } finally {
            setProbing(null);
        }
    };

    const toggleActive = async (node: AdminNode) => {
        await fetch(`/api/admin/ai/nodes/${node.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: !node.active }),
        });
        load();
    };

    const remove = async (id: string) => {
        await fetch(`/api/admin/ai/nodes/${id}`, { method: "DELETE" });
        setConfirmDelete(null);
        load();
    };

    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };

    const field: React.CSSProperties = {
        width: "100%", padding: "9px 11px",
        borderRadius: t.buttonRadius,
        border: `1px solid ${t.borderPrimary}`,
        background: t.bgInput, color: t.textPrimary,
        fontSize: "0.85rem", fontFamily: t.fontFamily, outline: "none",
    };

    const label: React.CSSProperties = {
        display: "block", fontSize: "0.72rem", fontWeight: 700,
        color: t.textMuted, marginBottom: 5,
        letterSpacing: "0.04em", textTransform: "uppercase",
    };

    const isLocal = form.provider === "LOCAL";
    // A local node is unreachable without an endpoint; a hosted one is
    // unusable without a key. Mirrors the refinements on the API schema.
    const canCreate = Boolean(
        form.name && form.displayName && form.gpuLabel && form.modelId
        && (isLocal ? form.baseUrl : form.apiKey),
    );

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", background: t.bgPrimary, fontFamily: t.fontFamily }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: t.cardRadius,
                        background: t.accentPrimaryMuted,
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <Bot style={{ width: 22, height: 22, color: t.accentPrimary }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>AI Nodes</h1>
                        <p style={{ fontSize: "0.83rem", color: t.textMuted }}>
                            Local LM Studio hosts and hosted providers, side by side. STANDARD is open
                            to all users; PREMIUM is admin-only. Users can mix them in one conversation.
                        </p>
                    </div>
                </div>

                <button
                    id="admin-ai-add-node"
                    onClick={() => setShowForm(v => !v)}
                    style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "10px 16px", flexShrink: 0,
                        borderRadius: t.buttonRadius, border: "none",
                        background: t.accentPrimary, color: t.textInverse,
                        fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
                        fontFamily: t.fontFamily, transition: "transform 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
                >
                    {showForm ? <X style={{ width: 15, height: 15 }} /> : <Plus style={{ width: 15, height: 15 }} />}
                    {showForm ? "Cancel" : "Add node"}
                </button>
            </div>

            {error && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 15px", marginBottom: 20,
                    borderRadius: t.cardRadius,
                    border: `1px solid ${t.statusError}40`,
                    background: t.statusErrorBg, color: t.statusError, fontSize: "0.83rem",
                }}>
                    <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} />
                    {error}
                </div>
            )}

            {/* Create form */}
            {showForm && (
                <div style={{ ...card, padding: "22px 26px", marginBottom: 24 }}>
                    <h2 style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 18 }}>
                        Register model
                    </h2>

                    {/* Provider first — it decides which of the fields below matter. */}
                    <div style={{ marginBottom: 18 }}>
                        <label style={label}>Provider</label>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {(Object.keys(PROVIDER_LABEL) as Provider[]).map(p => (
                                <button
                                    key={p}
                                    onClick={() => pickProvider(p)}
                                    style={{
                                        display: "inline-flex", alignItems: "center", gap: 7,
                                        padding: "8px 14px", borderRadius: t.buttonRadius,
                                        border: `1px solid ${form.provider === p ? t.accentPrimary : t.borderPrimary}`,
                                        background: form.provider === p ? t.accentPrimaryMuted : "transparent",
                                        color: form.provider === p ? t.accentPrimary : t.textSecondary,
                                        fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                                        fontFamily: t.fontFamily,
                                    }}
                                >
                                    {p === "LOCAL"
                                        ? <Server style={{ width: 13, height: 13 }} />
                                        : <Cloud style={{ width: 13, height: 13 }} />}
                                    {PROVIDER_LABEL[p]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                        <div>
                            <label style={label}>Node name</label>
                            <input style={field} value={form.name}
                                placeholder={isLocal ? "lm-rx580-pair" : "claude-opus"}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                            <label style={label}>Display name</label>
                            <input style={field} value={form.displayName} placeholder="Qwen2.5 14B"
                                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
                        </div>
                        <div>
                            <label style={label}>{isLocal ? "GPU label" : "Vendor label"}</label>
                            <input style={field} value={form.gpuLabel}
                                placeholder={isLocal ? "2× RX 580 · 16 GB" : "Anthropic"}
                                onChange={e => setForm(f => ({ ...f, gpuLabel: e.target.value }))} />
                        </div>
                        <div>
                            <label style={label}>Access tier</label>
                            <select style={field} value={form.tier}
                                onChange={e => setForm(f => ({ ...f, tier: e.target.value as Tier }))}>
                                <option value="STANDARD">STANDARD — all users</option>
                                <option value="PREMIUM">PREMIUM — admins only</option>
                            </select>
                        </div>
                        <div>
                            <label style={label}>
                                {isLocal ? "Base URL" : "API URL (optional override)"}
                            </label>
                            <input style={field} value={form.baseUrl}
                                placeholder={isLocal
                                    ? "http://10.0.1.50:1234/v1"
                                    : "leave blank for the vendor's own endpoint"}
                                onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} />
                        </div>
                        <div>
                            <label style={label}>Model id</label>
                            <input style={field} value={form.modelId} placeholder="qwen2.5-14b-instruct"
                                onChange={e => setForm(f => ({ ...f, modelId: e.target.value }))} />
                        </div>
                        <div>
                            <label style={label}>Context length</label>
                            <input style={field} type="number" value={form.contextLen}
                                onChange={e => setForm(f => ({ ...f, contextLen: Number(e.target.value) }))} />
                        </div>
                        <div>
                            <label style={label}>Max output tokens</label>
                            <input style={field} type="number" value={form.maxTokens}
                                onChange={e => setForm(f => ({ ...f, maxTokens: Number(e.target.value) }))} />
                        </div>
                        <div>
                            <label style={label}>
                                {form.provider === "ANTHROPIC" ? "Subscription Token / API key" : "API key"} {isLocal ? "(optional)" : "(required)"}
                            </label>
                            <input style={field} type="password" value={form.apiKey}
                                placeholder={isLocal ? "usually blank" : form.provider === "ANTHROPIC" ? "sk-ant-oat… / sk-ant-sid… / sk-ant-api…" : "AIza…"}
                                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))} />

                            {form.provider === "ANTHROPIC" && (
                                <div style={{ marginTop: 8 }}>
                                    <button
                                        type="button"
                                        onClick={startClaudeOAuth}
                                        disabled={oauthLoading}
                                        style={{
                                            display: "inline-flex", alignItems: "center", gap: 7,
                                            padding: "6px 12px", borderRadius: t.buttonRadius,
                                            border: `1px solid ${t.accentPrimary}`,
                                            background: t.accentPrimaryMuted,
                                            color: t.accentPrimary,
                                            fontSize: "0.76rem", fontWeight: 700, cursor: "pointer",
                                            fontFamily: t.fontFamily, transition: "all 0.15s",
                                        }}
                                    >
                                        {oauthLoading ? <RefreshCw style={{ width: 13, height: 13, animation: "adminSpin 1s linear infinite" }} /> : <Sparkles style={{ width: 13, height: 13 }} />}
                                        Login to Claude & Extract Subscription Key
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: "grid", gap: 14, marginTop: 18, maxWidth: 700 }}>
                        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                            <input
                                type="checkbox"
                                checked={form.reasoningControl}
                                onChange={e => setForm(f => ({ ...f, reasoningControl: e.target.checked }))}
                                style={{ marginTop: 3, accentColor: t.accentPrimary, cursor: "pointer" }}
                            />
                            <span>
                                <span style={{ display: "block", fontSize: "0.83rem", fontWeight: 600, color: t.textPrimary }}>
                                    Runtime honours reasoning effort
                                </span>
                                <span style={{ display: "block", fontSize: "0.76rem", color: t.textMuted, marginTop: 3, lineHeight: 1.5 }}>
                                    {isLocal
                                        ? "Leave off unless you have confirmed it. LM Studio silently ignores this "
                                          + "for some models — gemma-4-26b-a4b-qat produced identical reasoning at "
                                          + "every effort level — and a control that does nothing is worse than none. "
                                          + "Users always get the show/hide toggle regardless."
                                        : "Claude maps the effort control onto its own thinking budget. Gemini "
                                          + "decides for itself, so leave this off there."}
                                </span>
                            </span>
                        </label>

                        {form.provider === "ANTHROPIC" && (
                            <>
                                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                                    <input
                                        type="checkbox"
                                        checked={form.serverSandbox}
                                        onChange={e => setForm(f => ({ ...f, serverSandbox: e.target.checked }))}
                                        style={{ marginTop: 3, accentColor: t.accentPrimary, cursor: "pointer" }}
                                    />
                                    <span>
                                        <span style={{ display: "block", fontSize: "0.83rem", fontWeight: 600, color: t.textPrimary }}>
                                            Let Claude run code in its own sandbox
                                        </span>
                                        <span style={{ display: "block", fontSize: "0.76rem", color: t.textMuted, marginTop: 3, lineHeight: 1.5 }}>
                                            Claude decides on its own when a task needs code — analysis,
                                            file processing, arithmetic it should not do in its head — and
                                            runs it in an Anthropic-hosted container. Nothing executes on
                                            our infrastructure. It is billed compute and an execution
                                            surface, which is why it is off by default.
                                        </span>
                                    </span>
                                </label>

                                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                                    <input
                                        type="checkbox"
                                        checked={form.serverWebAccess}
                                        onChange={e => setForm(f => ({ ...f, serverWebAccess: e.target.checked }))}
                                        style={{ marginTop: 3, accentColor: t.accentPrimary, cursor: "pointer" }}
                                    />
                                    <span>
                                        <span style={{ display: "block", fontSize: "0.83rem", fontWeight: 600, color: t.textPrimary }}>
                                            Allow hosted web search and fetch
                                        </span>
                                        <span style={{ display: "block", fontSize: "0.76rem", color: t.textMuted, marginTop: 3, lineHeight: 1.5 }}>
                                            Egress happens on Anthropic&rsquo;s side, not from our network.
                                            These tool versions carry their own execution environment, so
                                            enabling this supersedes the sandbox switch above rather than
                                            stacking with it.
                                        </span>
                                    </span>
                                </label>
                            </>
                        )}

                        {form.provider === "GOOGLE" && (
                            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                                <input
                                    type="checkbox"
                                    checked={form.serverWebAccess}
                                    onChange={e => setForm(f => ({ ...f, serverWebAccess: e.target.checked }))}
                                    style={{ marginTop: 3, accentColor: t.accentPrimary, cursor: "pointer" }}
                                />
                                <span>
                                    <span style={{ display: "block", fontSize: "0.83rem", fontWeight: 600, color: t.textPrimary }}>
                                        Allow Google Search grounding
                                    </span>
                                    <span style={{ display: "block", fontSize: "0.76rem", color: t.textMuted, marginTop: 3, lineHeight: 1.5 }}>
                                        Gemini may search the web to ground an answer. Requests leave from
                                        Google&rsquo;s infrastructure.
                                    </span>
                                </span>
                            </label>
                        )}
                    </div>

                    {!isLocal && (
                        <p style={{
                            marginTop: 16, padding: "11px 13px", maxWidth: 700,
                            borderRadius: t.buttonRadius,
                            border: `1px solid ${t.borderPrimary}`,
                            background: t.bgTertiary,
                            fontSize: "0.76rem", lineHeight: 1.55, color: t.textMuted,
                        }}>
                            The key or subscription token is encrypted at rest and decrypted only server-side.
                            {form.provider === "ANTHROPIC" && " For Claude, you can use either a Claude Subscription token (OAuth / setup token starting with sk-ant-oat… or sk-ant-sid…, sent via Bearer auth) or an Anthropic API key (sk-ant-api…). "}
                            Creating the node spends one token verifying that the credential, the model
                            id and the network path all agree. Retrieval stays local either way.
                        </p>
                    )}

                    <button
                        onClick={save}
                        disabled={saving || !canCreate}
                        style={{
                            marginTop: 20, padding: "10px 20px",
                            borderRadius: t.buttonRadius, border: "none",
                            background: t.accentPrimary, color: t.textInverse,
                            fontSize: "0.85rem", fontWeight: 700,
                            cursor: saving ? "wait" : "pointer",
                            opacity: canCreate ? 1 : 0.5,
                            fontFamily: t.fontFamily,
                        }}
                    >
                        {saving ? "Saving…" : "Create and probe"}
                    </button>
                </div>
            )}

            {/* Node list */}
            {loading ? (
                <div style={{ ...card, padding: "40px", textAlign: "center", color: t.textMuted, fontSize: "0.87rem" }}>
                    Loading inference nodes…
                </div>
            ) : nodes.length === 0 ? (
                <div style={{ ...card, padding: "48px 40px", textAlign: "center" }}>
                    <Bot style={{ width: 30, height: 30, color: t.textMuted, marginBottom: 12 }} />
                    <p style={{ fontSize: "0.92rem", fontWeight: 600, color: t.textPrimary, marginBottom: 6 }}>
                        No inference nodes registered
                    </p>
                    <p style={{ fontSize: "0.82rem", color: t.textMuted }}>
                        Add one LM Studio host per GPU pair. Users see STANDARD nodes; PREMIUM stays admin-only.
                    </p>
                </div>
            ) : (
                <div style={{ display: "grid", gap: 14 }}>
                    {nodes.map(node => {
                        const p = probes[node.id];
                        return (
                            <div key={node.id} style={{ ...card, padding: "20px 24px" }}>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                                            <Circle style={{
                                                width: 9, height: 9, flexShrink: 0,
                                                fill: node.online ? t.statusSuccess : t.statusError,
                                                color: node.online ? t.statusSuccess : t.statusError,
                                            }} />
                                            <span style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary }}>
                                                {node.displayName}
                                            </span>
                                            <span style={{
                                                display: "inline-flex", alignItems: "center", gap: 4,
                                                fontSize: "0.63rem", fontWeight: 800, letterSpacing: "0.06em",
                                                padding: "2px 8px", borderRadius: 20,
                                                background: t.bgTertiary, color: t.textSecondary,
                                            }}>
                                                {node.provider === "LOCAL"
                                                    ? <Server style={{ width: 9, height: 9 }} />
                                                    : <Cloud style={{ width: 9, height: 9 }} />}
                                                {node.provider}
                                            </span>
                                            <span style={{
                                                fontSize: "0.63rem", fontWeight: 800, letterSpacing: "0.06em",
                                                padding: "2px 8px", borderRadius: 20,
                                                display: "inline-flex", alignItems: "center", gap: 4,
                                                background: node.tier === "PREMIUM" ? t.statusWarningBg : t.bgTertiary,
                                                color: node.tier === "PREMIUM" ? t.statusWarning : t.textSecondary,
                                            }}>
                                                {node.tier === "PREMIUM" && <Lock style={{ width: 9, height: 9 }} />}
                                                {node.tier}
                                            </span>
                                            {!node.active && (
                                                <span style={{
                                                    fontSize: "0.63rem", fontWeight: 800, padding: "2px 8px",
                                                    borderRadius: 20, background: t.bgTertiary, color: t.textMuted,
                                                }}>
                                                    DRAINED
                                                </span>
                                            )}
                                        </div>

                                        <p style={{ fontSize: "0.78rem", color: t.textMuted, fontFamily: t.fontMono, marginBottom: 4 }}>
                                            {node.name} · {node.gpuLabel}
                                            {node.baseUrl ? ` · ${node.baseUrl}` : " · vendor endpoint"}
                                        </p>
                                        <p style={{ fontSize: "0.78rem", color: t.textMuted }}>
                                            {node.modelId} · {(node.contextLen / 1024).toFixed(0)}k context · max {node.maxTokens} tok
                                            {node.hasApiKey && " · key set"}
                                            {node.serverSandbox && " · sandbox"}
                                            {node.serverWebAccess && " · web"}
                                        </p>

                                        {/* Subscription tokens expire. Say when, and whether this
                                            node can renew itself, rather than letting it go dark. */}
                                        {node.tokenExpiresAt && (() => {
                                            const ms = new Date(node.tokenExpiresAt).getTime() - Date.now();
                                            const expired = ms <= 0;
                                            const hours = Math.floor(Math.abs(ms) / 3_600_000);
                                            const mins = Math.floor((Math.abs(ms) % 3_600_000) / 60_000);
                                            const when = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                                            const tone = expired && !node.canRefresh ? t.statusError
                                                : expired ? t.statusWarning : t.textMuted;
                                            return (
                                                <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: tone, marginTop: 8 }}>
                                                    <Clock style={{ width: 12, height: 12, flexShrink: 0 }} />
                                                    {expired
                                                        ? node.canRefresh
                                                            ? `Subscription token expired ${when} ago — renews on next use`
                                                            : `Subscription token expired ${when} ago — re-authenticate, it cannot renew itself`
                                                        : node.canRefresh
                                                            ? `Subscription token valid for ${when}, renews automatically`
                                                            : `Subscription token valid for ${when} — cannot renew itself`}
                                                </p>
                                            );
                                        })()}

                                        <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: t.textMuted, marginTop: 8 }}>
                                            <Users style={{ width: 12, height: 12 }} />
                                            {node.conversationCount} conversation{node.conversationCount === 1 ? "" : "s"}
                                        </p>

                                        {node.lastError && !node.online && (
                                            <p style={{ fontSize: "0.75rem", color: t.statusError, marginTop: 8 }}>
                                                {node.lastError}
                                            </p>
                                        )}

                                        {p && (
                                            <div style={{
                                                marginTop: 12, padding: "10px 12px",
                                                borderRadius: t.buttonRadius,
                                                background: t.bgTertiary,
                                                fontSize: "0.76rem", color: t.textSecondary,
                                            }}>
                                                <span style={{
                                                    display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 600,
                                                    color: p.online ? t.statusSuccess : t.statusError,
                                                }}>
                                                    {p.online
                                                        ? <Check style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2 }} />
                                                        : <X style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2 }} />}
                                                    <span style={{ wordBreak: "break-word" }}>{p.detail}</span>
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                        <button
                                            onClick={() => probe(node.id)}
                                            disabled={probing === node.id}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 6,
                                                padding: "7px 13px", borderRadius: t.buttonRadius,
                                                border: `1px solid ${t.borderPrimary}`,
                                                background: "transparent", color: t.textSecondary,
                                                fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                                                fontFamily: t.fontFamily,
                                            }}
                                        >
                                            <RefreshCw style={{
                                                width: 12, height: 12,
                                                animation: probing === node.id ? "adminSpin 1s linear infinite" : "none",
                                            }} />
                                            Probe
                                        </button>

                                        <button
                                            onClick={() => toggleActive(node)}
                                            style={{
                                                padding: "7px 13px", borderRadius: t.buttonRadius,
                                                border: `1px solid ${t.borderPrimary}`,
                                                background: "transparent",
                                                color: node.active ? t.statusWarning : t.statusSuccess,
                                                fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                                                fontFamily: t.fontFamily,
                                            }}
                                        >
                                            {node.active ? "Drain" : "Enable"}
                                        </button>

                                        <button
                                            onClick={() => confirmDelete === node.id ? remove(node.id) : setConfirmDelete(node.id)}
                                            onMouseLeave={() => setConfirmDelete(null)}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 6,
                                                padding: "7px 13px", borderRadius: t.buttonRadius,
                                                border: `1px solid ${confirmDelete === node.id ? t.statusError : t.borderPrimary}`,
                                                background: confirmDelete === node.id ? t.statusErrorBg : "transparent",
                                                color: confirmDelete === node.id ? t.statusError : t.textMuted,
                                                fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                                                fontFamily: t.fontFamily,
                                            }}
                                        >
                                            <Trash2 style={{ width: 12, height: 12 }} />
                                            {confirmDelete === node.id ? "Confirm" : "Delete"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* OAuth Login & Token Extraction Modal */}
            {oauthModal && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 1000, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                }}>
                    <div style={{
                        ...card, maxWidth: 500, width: "100%", padding: "24px 28px",
                        position: "relative", animation: "aiFadeIn 0.2s ease",
                    }}>
                        <button
                            onClick={() => setOauthModal(false)}
                            style={{
                                position: "absolute", top: 18, right: 18,
                                background: "none", border: "none", color: t.textMuted,
                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                        >
                            <X style={{ width: 18, height: 18 }} />
                        </button>

                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                            <div style={{
                                width: 38, height: 38, borderRadius: t.cardRadius,
                                background: t.accentPrimaryMuted, color: t.accentPrimary,
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                <Sparkles style={{ width: 20, height: 20 }} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: t.textPrimary }}>
                                    Connect Claude Subscription
                                </h3>
                                <p style={{ fontSize: "0.78rem", color: t.textMuted }}>
                                    Log in to Claude to automatically extract your subscription token.
                                </p>
                            </div>
                        </div>

                        {oauthSuccess ? (
                            <div style={{
                                padding: "14px 16px", borderRadius: t.cardRadius,
                                background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}40`,
                                color: t.statusSuccess, fontSize: "0.85rem", fontWeight: 600,
                                display: "flex", alignItems: "center", gap: 10,
                            }}>
                                <Check style={{ width: 18, height: 18, flexShrink: 0 }} />
                                {oauthSuccess}
                            </div>
                        ) : (
                            <>
                                <div style={{
                                    padding: "14px 16px", borderRadius: t.cardRadius,
                                    background: t.bgTertiary, border: `1px solid ${t.borderPrimary}`,
                                    marginBottom: 18, fontSize: "0.8rem", color: t.textSecondary, lineHeight: 1.55,
                                }}>
                                    <p style={{ fontWeight: 600, color: t.textPrimary, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                        <ExternalLink style={{ width: 14, height: 14, color: t.accentPrimary }} />
                                        Option 1: Complete login in the popup window
                                    </p>
                                    <p style={{ color: t.textMuted, marginBottom: 10 }}>
                                        No Client ID setup is required — the system uses Anthropic&rsquo;s standard OAuth flow. Sign in to your Claude Pro/Team account in the popup. Once approved, your subscription token (<code style={{ fontFamily: t.fontMono, color: t.accentPrimary }}>sk-ant-oat…</code>) auto-populates.
                                    </p>

                                    <p style={{ fontWeight: 600, color: t.textPrimary, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                                        <Sparkles style={{ width: 14, height: 14, color: t.accentPrimary }} />
                                        Option 2: Extract via Terminal / CLI
                                    </p>
                                    <p style={{ color: t.textMuted }}>
                                        Run <code style={{ fontFamily: t.fontMono, background: t.bgSecondary, padding: "2px 6px", borderRadius: 4, color: t.accentPrimary }}>npx @anthropic-ai/claude-code setup-token</code> in your terminal, then paste the generated <code style={{ fontFamily: t.fontMono, color: t.accentPrimary }}>sk-ant-oat…</code> token below.
                                    </p>
                                </div>

                                {oauthError && (
                                    <div style={{
                                        padding: "10px 14px", borderRadius: t.cardRadius, marginBottom: 16,
                                        background: t.statusErrorBg, border: `1px solid ${t.statusError}40`,
                                        color: t.statusError, fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 8,
                                    }}>
                                        <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
                                        {oauthError}
                                    </div>
                                )}

                                <div>
                                    <label style={label}>
                                        Manual Fallback: Paste Authorization Code or Redirect URL
                                    </label>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <input
                                            style={field}
                                            value={pastedCode}
                                            placeholder="Paste http://... callback URL or code here"
                                            onChange={e => setPastedCode(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => exchangeClaudeCode(pastedCode)}
                                            disabled={oauthLoading || !pastedCode.trim()}
                                            style={{
                                                padding: "8px 14px", borderRadius: t.buttonRadius,
                                                border: "none", background: t.accentPrimary, color: t.textInverse,
                                                fontSize: "0.8rem", fontWeight: 700, cursor: oauthLoading ? "wait" : "pointer",
                                                opacity: pastedCode.trim() ? 1 : 0.5, flexShrink: 0,
                                                fontFamily: t.fontFamily,
                                            }}
                                        >
                                            {oauthLoading ? "Extracting…" : "Extract"}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <style>{`@keyframes adminSpin { to { transform: rotate(360deg) } }`}</style>
        </div>
    );
}
