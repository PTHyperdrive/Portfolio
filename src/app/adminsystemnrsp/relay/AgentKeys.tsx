"use client";

import { useState, useEffect, useCallback } from "react";
import {
    KeyRound, Plus, RotateCcw, Ban, Undo2, Eye, EyeOff, Copy, Check, AlertTriangle,
} from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";

type Shell = "cmd" | "powershell" | "unix";

const SHELL_LABELS: Record<Shell, string> = {
    cmd: "Windows · cmd.exe",
    powershell: "Windows · PowerShell",
    unix: "Linux / macOS",
};

/**
 * The whole setup, with this machine's own name and secret already in it.
 *
 * A placeholder to substitute by hand cost two debugging rounds: it was pasted
 * verbatim into the download command, the request 401'd, and the failure only
 * showed up two steps later as node reporting a syntax error in a file that was
 * really a JSON error body. Nothing here needs editing.
 */
function setupFor(shell: Shell, host: string, name: string, secret: string): string {
    const src = `https://${host}/api/relay/agent-source`;
    const ws = `wss://${host}/api/relay/agent`;

    if (shell === "powershell") {
        return [
            "mkdir claude-relay -Force",
            "cd claude-relay",
            "npm init -y",
            "npm install ws node-pty",
            `Invoke-WebRequest -Uri "${src}" -Headers @{ Authorization = "Bearer ${secret}" } -OutFile claude-relay.mjs`,
            `$env:RELAY_URL = "${ws}"`,
            `$env:RELAY_AGENT_NAME = "${name}"`,
            `$env:RELAY_AGENT_SECRET = "${secret}"`,
            "node claude-relay.mjs",
        ].join("\n");
    }
    if (shell === "cmd") {
        return [
            "mkdir claude-relay",
            "cd claude-relay",
            "npm init -y",
            "npm install ws node-pty",
            `curl -f -H "Authorization: Bearer ${secret}" "${src}" -o claude-relay.mjs`,
            `set RELAY_URL=${ws}`,
            `set RELAY_AGENT_NAME=${name}`,
            `set RELAY_AGENT_SECRET=${secret}`,
            "node claude-relay.mjs",
        ].join("\n");
    }
    return [
        "mkdir -p ~/claude-relay && cd ~/claude-relay",
        "npm init -y",
        "npm install ws node-pty",
        `curl -fsSL -H "Authorization: Bearer ${secret}" "${src}" -o claude-relay.mjs`,
        `export RELAY_URL="${ws}"`,
        `export RELAY_AGENT_NAME="${name}"`,
        `export RELAY_AGENT_SECRET="${secret}"`,
        "node claude-relay.mjs",
    ].join("\n");
}

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
    const [shell, setShell] = useState<Shell>("cmd");

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
                            <div style={{ marginTop: 10 }}>
                                <div style={{ display: "flex", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
                                    {(Object.keys(SHELL_LABELS) as Shell[]).map(sh => (
                                        <button
                                            key={sh}
                                            onClick={() => setShell(sh)}
                                            style={{
                                                padding: "3px 10px", borderRadius: t.buttonRadius,
                                                border: `1px solid ${shell === sh ? t.accentPrimary : t.borderPrimary}`,
                                                background: shell === sh ? t.accentPrimaryMuted : "transparent",
                                                color: shell === sh ? t.accentPrimary : t.textMuted,
                                                fontSize: "0.7rem", fontWeight: 600, cursor: "pointer",
                                                fontFamily: t.fontFamily,
                                            }}
                                        >
                                            {SHELL_LABELS[sh]}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => copy(k.id, setupFor(shell, host, k.name, k.secret!))}
                                        style={{
                                            marginLeft: "auto",
                                            display: "inline-flex", alignItems: "center", gap: 5,
                                            padding: "3px 10px", borderRadius: t.buttonRadius,
                                            border: `1px solid ${t.borderPrimary}`,
                                            background: t.bgCard, color: t.textMuted,
                                            fontSize: "0.7rem", fontWeight: 600, cursor: "pointer",
                                            fontFamily: t.fontFamily,
                                        }}
                                    >
                                        {copied === k.id
                                            ? <><Check style={{ width: 11, height: 11 }} /> Copied</>
                                            : <><Copy style={{ width: 11, height: 11 }} /> Copy setup</>}
                                    </button>
                                </div>
                                <pre style={{
                                    margin: 0, padding: "10px 12px", overflowX: "auto",
                                    borderRadius: t.buttonRadius,
                                    background: t.isLight ? "#f6f8fa" : "#0d1117",
                                    border: `1px solid ${t.borderPrimary}`,
                                    fontFamily: t.fontMono, fontSize: "0.72rem", lineHeight: 1.65,
                                    color: t.isLight ? t.textPrimary : "#e6edf3",
                                }}>
                                    <code>{setupFor(shell, host, k.name, k.secret)}</code>
                                </pre>
                                <p style={{ marginTop: 6, fontSize: "0.73rem", color: t.textMuted }}>
                                    Complete as it stands — the name and secret for{" "}
                                    <strong style={{ color: t.textPrimary }}>{k.name}</strong> are
                                    already in it. Nothing to substitute.
                                </p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {keys.length > 0 && (
                <p style={{ marginTop: 10, color: t.textMuted, fontSize: "0.78rem" }}>
                    Press the eye on a machine for its full setup command, ready to paste on that
                    box. <code style={mono}>RELAY_AGENT_NAME</code> must match the name here exactly
                    — the server authenticates the credential, not the announcement.
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
