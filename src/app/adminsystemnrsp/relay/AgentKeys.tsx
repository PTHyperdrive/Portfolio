"use client";

import { useState, useEffect, useCallback } from "react";
import {
    KeyRound, Plus, RotateCcw, Ban, Undo2, Eye, EyeOff, Copy, Check, AlertTriangle,
} from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";

interface AgentKey {
    id: string;
    name: string;
    generation: number;
    counter: number;
    revoked: boolean;
    lastSeenAt: string | null;
    lastIp: string | null;
    createdAt: string;
    secret: string | null;
}

/**
 * Per-machine relay credentials.
 *
 * Each machine has its own secret rather than sharing one, so a leak names the
 * box it came from and revoking one leaves the rest connected.
 *
 * Secrets are derived from the server master secret, the name and a generation
 * number — nothing is stored, which is why one can be shown again rather than
 * only at creation. Rotating bumps the generation and retires the previous
 * secret permanently.
 */
export default function AgentKeys({ host }: { host: string }) {
    const t = useThemeTokens();

    const [keys, setKeys] = useState<AgentKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [newName, setNewName] = useState("");
    const [busy, setBusy] = useState<string | null>(null);
    const [shown, setShown] = useState<Set<string>>(new Set());
    const [copied, setCopied] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/relay/agents");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not load machines");
            setKeys(data.agents);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load machines");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const create = async () => {
        if (!newName.trim()) return;
        setBusy("create");
        setError(null);
        try {
            const res = await fetch("/api/admin/relay/agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not create");
            setNewName("");
            // Reveal it straight away — it is needed immediately.
            setShown(prev => new Set(prev).add(data.agent.id));
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create");
        } finally {
            setBusy(null);
        }
    };

    const act = async (id: string, action: "rotate" | "revoke" | "restore") => {
        setBusy(id);
        setError(null);
        try {
            const res = await fetch(`/api/admin/relay/agents/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not update");
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update");
        } finally {
            setBusy(null);
        }
    };

    const toggle = (id: string) => setShown(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const copy = (id: string, secret: string) => {
        void navigator.clipboard.writeText(secret).then(() => {
            setCopied(id);
            setTimeout(() => setCopied(null), 1500);
        });
    };

    const mono: React.CSSProperties = { fontFamily: t.fontMono, fontSize: "0.74rem" };

    return (
        <div style={{
            padding: "14px 16px", marginBottom: 16,
            borderRadius: t.cardRadius,
            border: `1px solid ${t.borderPrimary}`,
            background: t.bgTertiary,
            fontSize: "0.82rem", lineHeight: 1.6, color: t.textSecondary,
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <KeyRound style={{ width: 15, height: 15, color: t.accentPrimary }} />
                <strong style={{ color: t.textPrimary, fontSize: "0.88rem" }}>Machines</strong>
                <span style={{ color: t.textMuted, fontSize: "0.78rem" }}>
                    one credential each · revocable · replay-protected
                </span>
            </div>

            <p style={{ marginBottom: 12, color: t.textMuted }}>
                Every connection carries a counter that must exceed the last one accepted, so a
                handshake captured off the wire cannot be reused — the same idea as a car key fob.
                Rotating issues a new secret and retires the old one immediately.
            </p>

            {error && (
                <div style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    padding: "9px 12px", marginBottom: 10,
                    borderRadius: t.buttonRadius,
                    border: `1px solid ${t.statusError}40`,
                    background: t.statusErrorBg, color: t.statusError, fontSize: "0.8rem",
                }}>
                    <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />
                    {error}
                </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void create(); }}
                    placeholder="machine name, e.g. workstation"
                    maxLength={60}
                    style={{
                        flex: "1 1 220px", padding: "7px 11px",
                        borderRadius: t.buttonRadius,
                        border: `1px solid ${t.borderPrimary}`,
                        background: t.bgInput, color: t.textPrimary,
                        fontSize: "0.82rem", fontFamily: t.fontFamily, outline: "none",
                    }}
                />
                <button
                    onClick={() => void create()}
                    disabled={busy === "create" || !newName.trim()}
                    style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "7px 14px", borderRadius: t.buttonRadius, border: "none",
                        background: t.accentPrimary, color: t.textInverse,
                        fontSize: "0.8rem", fontWeight: 700,
                        cursor: newName.trim() ? "pointer" : "not-allowed",
                        opacity: newName.trim() ? 1 : 0.5,
                        fontFamily: t.fontFamily,
                    }}
                >
                    <Plus style={{ width: 13, height: 13 }} /> Add machine
                </button>
            </div>

            {loading && <p style={{ color: t.textMuted }}>Loading…</p>}

            {!loading && keys.length === 0 && (
                <p style={{ color: t.textMuted }}>
                    No machines yet. Add one above, then use its secret as{" "}
                    <code style={mono}>RELAY_AGENT_SECRET</code> on that box.
                </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {keys.map(k => (
                    <div
                        key={k.id}
                        style={{
                            padding: "10px 12px",
                            borderRadius: t.buttonRadius,
                            border: `1px solid ${k.revoked ? `${t.statusError}40` : t.borderPrimary}`,
                            background: k.revoked ? t.statusErrorBg : t.bgCard,
                            opacity: k.revoked ? 0.75 : 1,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <strong style={{ color: t.textPrimary, fontSize: "0.86rem" }}>{k.name}</strong>
                            {k.revoked && (
                                <span style={{
                                    fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.05em",
                                    padding: "1px 7px", borderRadius: 20,
                                    background: t.statusErrorBg, color: t.statusError,
                                }}>
                                    REVOKED
                                </span>
                            )}
                            <span style={{ fontSize: "0.72rem", color: t.textMuted }}>
                                gen {k.generation} · {k.counter} connection{k.counter === 1 ? "" : "s"}
                                {k.lastSeenAt && ` · last seen ${new Date(k.lastSeenAt).toLocaleString()}`}
                                {k.lastIp && ` from ${k.lastIp}`}
                            </span>

                            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                                {!k.revoked && (
                                    <button
                                        onClick={() => toggle(k.id)}
                                        title={shown.has(k.id) ? "Hide secret" : "Show secret"}
                                        style={iconBtn(t)}
                                    >
                                        {shown.has(k.id)
                                            ? <EyeOff style={{ width: 12, height: 12 }} />
                                            : <Eye style={{ width: 12, height: 12 }} />}
                                    </button>
                                )}
                                <button
                                    onClick={() => void act(k.id, "rotate")}
                                    disabled={busy === k.id}
                                    title="Issue a new secret and retire the old one"
                                    style={iconBtn(t)}
                                >
                                    <RotateCcw style={{ width: 12, height: 12 }} />
                                </button>
                                <button
                                    onClick={() => void act(k.id, k.revoked ? "restore" : "revoke")}
                                    disabled={busy === k.id}
                                    title={k.revoked ? "Allow this machine again" : "Revoke this machine"}
                                    style={iconBtn(t, k.revoked ? t.statusSuccess : t.statusError)}
                                >
                                    {k.revoked
                                        ? <Undo2 style={{ width: 12, height: 12 }} />
                                        : <Ban style={{ width: 12, height: 12 }} />}
                                </button>
                            </span>
                        </div>

                        {shown.has(k.id) && k.secret && (
                            <div style={{
                                display: "flex", alignItems: "center", gap: 8, marginTop: 8,
                                padding: "7px 10px", borderRadius: t.buttonRadius,
                                background: t.isLight ? "#f6f8fa" : "#0d1117",
                                border: `1px solid ${t.borderPrimary}`,
                            }}>
                                <code style={{ ...mono, flex: 1, wordBreak: "break-all", color: t.textPrimary }}>
                                    {k.secret}
                                </code>
                                <button onClick={() => copy(k.id, k.secret!)} style={iconBtn(t)}>
                                    {copied === k.id
                                        ? <Check style={{ width: 12, height: 12 }} />
                                        : <Copy style={{ width: 12, height: 12 }} />}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {keys.length > 0 && (
                <p style={{ marginTop: 10, color: t.textMuted, fontSize: "0.78rem" }}>
                    On the machine: <code style={mono}>RELAY_AGENT_NAME</code> must match the name
                    here, and <code style={mono}>RELAY_AGENT_SECRET</code> its secret. The relay URL
                    is <code style={mono}>wss://{host}/api/relay/agent</code>.
                </p>
            )}
        </div>
    );
}

function iconBtn(t: ReturnType<typeof useThemeTokens>, colour?: string): React.CSSProperties {
    return {
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 26, height: 26, borderRadius: t.buttonRadius,
        border: `1px solid ${t.borderPrimary}`,
        background: "transparent",
        color: colour ?? t.textMuted,
        cursor: "pointer", padding: 0,
    };
}
