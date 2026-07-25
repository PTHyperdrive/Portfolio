"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Bot, Plus, RefreshCw, Trash2, Circle, Lock, Users,
    AlertTriangle, Check, X,
} from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";

interface AdminNode {
    id: string;
    name: string;
    displayName: string;
    gpuLabel: string;
    tier: "STANDARD" | "PREMIUM";
    baseUrl: string;
    modelId: string;
    contextLen: number;
    maxTokens: number;
    active: boolean;
    online: boolean;
    lastError: string | null;
    lastCheckAt: string | null;
    hasApiKey: boolean;
    conversationCount: number;
}

interface ProbeResult {
    online: boolean;
    loadedModels: string[];
    modelMatches: boolean;
    lastError: string | null;
}

const BLANK = {
    name: "",
    displayName: "",
    gpuLabel: "",
    tier: "STANDARD" as "STANDARD" | "PREMIUM",
    baseUrl: "",
    apiKey: "",
    modelId: "",
    contextLen: 8192,
    maxTokens: 2048,
};

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

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/ai/nodes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, apiKey: form.apiKey || undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed to create node");
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
                            LM Studio hosts, one per GPU pair. STANDARD is open to all users; PREMIUM is admin-only.
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
                        Register inference host
                    </h2>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                        <div>
                            <label style={label}>Node name</label>
                            <input style={field} value={form.name} placeholder="lm-rx580-pair"
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                            <label style={label}>Display name</label>
                            <input style={field} value={form.displayName} placeholder="Qwen2.5 14B"
                                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
                        </div>
                        <div>
                            <label style={label}>GPU label</label>
                            <input style={field} value={form.gpuLabel} placeholder="2× RX 580 · 16 GB"
                                onChange={e => setForm(f => ({ ...f, gpuLabel: e.target.value }))} />
                        </div>
                        <div>
                            <label style={label}>Access tier</label>
                            <select style={field} value={form.tier}
                                onChange={e => setForm(f => ({ ...f, tier: e.target.value as "STANDARD" | "PREMIUM" }))}>
                                <option value="STANDARD">STANDARD — all users</option>
                                <option value="PREMIUM">PREMIUM — admins only</option>
                            </select>
                        </div>
                        <div>
                            <label style={label}>Base URL</label>
                            <input style={field} value={form.baseUrl} placeholder="http://10.0.1.50:1234/v1"
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
                            <label style={label}>API key (optional)</label>
                            <input style={field} type="password" value={form.apiKey} placeholder="usually blank"
                                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))} />
                        </div>
                    </div>

                    <button
                        onClick={save}
                        disabled={saving || !form.name || !form.baseUrl || !form.modelId}
                        style={{
                            marginTop: 20, padding: "10px 20px",
                            borderRadius: t.buttonRadius, border: "none",
                            background: t.accentPrimary, color: t.textInverse,
                            fontSize: "0.85rem", fontWeight: 700,
                            cursor: saving ? "wait" : "pointer",
                            opacity: (!form.name || !form.baseUrl || !form.modelId) ? 0.5 : 1,
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
                                            {node.name} · {node.gpuLabel} · {node.baseUrl}
                                        </p>
                                        <p style={{ fontSize: "0.78rem", color: t.textMuted }}>
                                            {node.modelId} · {(node.contextLen / 1024).toFixed(0)}k context · max {node.maxTokens} tok
                                            {node.hasApiKey && " · key set"}
                                        </p>

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
                                                {p.online ? (
                                                    <>
                                                        <span style={{ display: "flex", alignItems: "center", gap: 6, color: t.statusSuccess, fontWeight: 600 }}>
                                                            <Check style={{ width: 12, height: 12 }} /> Reachable
                                                        </span>
                                                        {p.loadedModels.length > 0 && (
                                                            <p style={{ marginTop: 6, fontFamily: t.fontMono }}>
                                                                Loaded: {p.loadedModels.join(", ")}
                                                            </p>
                                                        )}
                                                        {!p.modelMatches && (
                                                            <p style={{ marginTop: 6, color: t.statusWarning }}>
                                                                Configured model id is not in the loaded list — chats will fail.
                                                            </p>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span style={{ display: "flex", alignItems: "center", gap: 6, color: t.statusError, fontWeight: 600 }}>
                                                        <X style={{ width: 12, height: 12 }} /> {p.lastError ?? "Unreachable"}
                                                    </span>
                                                )}
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

            <style>{`@keyframes adminSpin { to { transform: rotate(360deg) } }`}</style>
        </div>
    );
}
