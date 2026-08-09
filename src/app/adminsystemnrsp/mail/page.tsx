"use client";

/**
 * Email server administration.
 *
 * Full control over every mailbox: create on any domain (including the
 * admin-only primary domain), suspend, reset passwords, delete with its mail,
 * and open any inbox directly — that last one goes through Dovecot's master
 * user, so no password is changed and the access is audit-logged server-side.
 *
 * The "unrouted" panel is the prompt the operator asked for: when mail
 * arrives for an address that has no inbox, the catch-all captures it and it
 * surfaces here as a one-click "create this mailbox".
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useIsMobile } from "@/lib/useIsMobile";
import {
    Mail, Plus, Trash2, KeyRound, Ban, CheckCircle2, Loader2, Search,
    Inbox, AlertTriangle, X, Copy, Check, RefreshCw, ExternalLink,
} from "lucide-react";

interface Domain {
    id: string; domain: string; active: boolean; adminOnly: boolean;
    catchAll: boolean; _count: { mailboxes: number };
}
interface Mailbox {
    id: string; address: string; localPart: string; quotaMb: number;
    active: boolean; kind: string; createdAt: string; lastLoginAt: string | null;
    domain: { id: string; domain: string };
    user: { id: string; email: string; name: string | null } | null;
}
interface Unrouted {
    id: string; recipient: string; lastSender: string | null;
    lastSubject: string | null; messageCount: number;
    firstSeenAt: string; lastSeenAt: string; resolved: boolean;
    domain: { id: string; domain: string };
}

export default function AdminMailPage() {
    const t = useThemeTokens();
    const isMobile = useIsMobile();

    const [loading, setLoading] = useState(true);
    const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);
    const [unrouted, setUnrouted] = useState<Unrouted[]>([]);
    const [q, setQ] = useState("");
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [prefill, setPrefill] = useState<{ localPart: string; domain: string } | null>(null);
    const [creds, setCreds] = useState<{ address: string; password: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [mRes, uRes] = await Promise.all([
                fetch(`/api/admin/mail/mailboxes?q=${encodeURIComponent(q)}`),
                fetch("/api/admin/mail/unrouted"),
            ]);
            if (mRes.ok) {
                const d = await mRes.json();
                setMailboxes(d.mailboxes ?? []);
                setDomains(d.domains ?? []);
            }
            if (uRes.ok) setUnrouted((await uRes.json()).unrouted ?? []);
        } catch { setError("Could not load mail data."); }
        finally { setLoading(false); }
    }, [q]);

    useEffect(() => { void load(); }, [load]);

    const patch = async (id: string, body: Record<string, unknown>) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/admin/mail/mailboxes/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const d = await res.json();
            if (!res.ok) { setError(d.error ?? "Update failed"); return; }
            if (d.password) setCreds({ address: d.mailbox.address, password: d.password });
            await load();
        } finally { setBusyId(null); }
    };

    const remove = async (mb: Mailbox) => {
        if (!confirm(`Delete ${mb.address} and every message in it? This cannot be undone.`)) return;
        setBusyId(mb.id);
        try {
            const res = await fetch(`/api/admin/mail/mailboxes/${mb.id}`, { method: "DELETE" });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError(d.error ?? "Delete failed");
                return;
            }
            await load();
        } finally { setBusyId(null); }
    };

    const dismissUnrouted = async (id: string) => {
        await fetch("/api/admin/mail/unrouted", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, resolved: true }),
        });
        await load();
    };

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius,
    };
    const pending = unrouted.filter(u => !u.resolved);

    return (
        <div style={{ padding: isMobile ? "18px 14px" : "28px 34px", fontFamily: t.fontFamily }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>Email Server</h1>
                    <p style={{ fontSize: "0.8rem", color: t.textMuted, marginTop: 3 }}>
                        {mailboxes.length} mailbox{mailboxes.length === 1 ? "" : "es"} across {domains.length} domain{domains.length === 1 ? "" : "s"}
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => void load()} style={btnGhost(t)}>
                        <RefreshCw style={{ width: 14, height: 14, ...(loading ? { animation: "spin 1s linear infinite" } : {}) }} /> Refresh
                    </button>
                    <button onClick={() => { setPrefill(null); setShowCreate(true); }} style={btnPrimary(t)}>
                        <Plus style={{ width: 15, height: 15 }} /> New mailbox
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: t.buttonRadius, background: t.statusErrorBg, color: t.statusError, fontSize: "0.82rem", display: "flex", justifyContent: "space-between" }}>
                    {error}
                    <button onClick={() => setError("")} style={{ background: "none", border: "none", color: t.statusError, cursor: "pointer" }}><X style={{ width: 13, height: 13 }} /></button>
                </div>
            )}

            {/* ── Unrouted prompts ── */}
            {pending.length > 0 && (
                <div style={{ ...card, marginBottom: 20, borderColor: t.statusWarning, overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", background: t.statusWarningBg, display: "flex", alignItems: "center", gap: 9 }}>
                        <AlertTriangle style={{ width: 16, height: 16, color: t.statusWarning }} />
                        <span style={{ fontWeight: 800, fontSize: "0.88rem", color: t.textPrimary }}>
                            {pending.length} address{pending.length === 1 ? "" : "es"} received mail with no inbox
                        </span>
                    </div>
                    {pending.map(u => (
                        <div key={u.id} style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "11px 16px",
                            borderTop: `1px solid ${t.borderSecondary}`, flexWrap: "wrap",
                        }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <p style={{ fontWeight: 700, fontSize: "0.85rem", color: t.textPrimary, fontFamily: t.fontMono }}>{u.recipient}</p>
                                <p style={{ fontSize: "0.73rem", color: t.textMuted, marginTop: 2 }}>
                                    {u.messageCount} message{u.messageCount === 1 ? "" : "s"}
                                    {u.lastSender ? ` · last from ${u.lastSender}` : ""}
                                    {u.lastSubject ? ` · "${u.lastSubject}"` : ""}
                                </p>
                            </div>
                            <button onClick={() => {
                                const [lp, dom] = u.recipient.split("@");
                                setPrefill({ localPart: lp, domain: dom });
                                setShowCreate(true);
                            }} style={btnPrimary(t)}>
                                <Plus style={{ width: 14, height: 14 }} /> Create inbox
                            </button>
                            <button onClick={() => void dismissUnrouted(u.id)} style={btnGhost(t)}>Dismiss</button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Domains ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
                {domains.map(d => (
                    <div key={d.id} style={{ ...card, padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <Mail style={{ width: 15, height: 15, color: t.accentPrimary }} />
                            <span style={{ fontWeight: 800, fontSize: "0.87rem", color: t.textPrimary }}>{d.domain}</span>
                        </div>
                        <p style={{ fontSize: "0.75rem", color: t.textMuted }}>
                            {d._count.mailboxes} mailbox{d._count.mailboxes === 1 ? "" : "es"}
                            {d.adminOnly ? " · admin only" : " · self-service"}
                            {d.catchAll ? " · catch-all on" : ""}
                        </p>
                    </div>
                ))}
            </div>

            {/* ── Search + table ── */}
            <div style={{ position: "relative", marginBottom: 14, maxWidth: 380 }}>
                <Search style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: t.textMuted }} />
                <input
                    value={q} onChange={e => setQ(e.target.value)}
                    placeholder="Search address or owner email..."
                    style={{
                        width: "100%", padding: "9px 12px 9px 34px", boxSizing: "border-box",
                        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
                        borderRadius: t.buttonRadius, color: t.textPrimary,
                        fontSize: "0.84rem", fontFamily: t.fontFamily, outline: "none",
                    }}
                />
            </div>

            <div style={{ ...card, overflow: "hidden" }}>
                {loading ? (
                    <div style={{ padding: 50, display: "flex", justifyContent: "center" }}>
                        <Loader2 style={{ width: 24, height: 24, color: t.accentPrimary, animation: "spin 1s linear infinite" }} />
                    </div>
                ) : mailboxes.length === 0 ? (
                    <div style={{ padding: "50px 20px", textAlign: "center" }}>
                        <Inbox style={{ width: 30, height: 30, color: t.textMuted, opacity: 0.35, margin: "0 auto 10px" }} />
                        <p style={{ fontSize: "0.85rem", color: t.textMuted }}>No mailboxes yet.</p>
                    </div>
                ) : mailboxes.map(mb => (
                    <div key={mb.id} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                        borderBottom: `1px solid ${t.borderSecondary}`, flexWrap: "wrap",
                        opacity: mb.active ? 1 : 0.55,
                    }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <span style={{ fontWeight: 700, fontSize: "0.86rem", color: t.textPrimary, fontFamily: t.fontMono }}>
                                    {mb.address}
                                </span>
                                {!mb.active && (
                                    <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: t.statusErrorBg, color: t.statusError }}>
                                        SUSPENDED
                                    </span>
                                )}
                                {mb.kind !== "USER" && (
                                    <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: t.bgTertiary, color: t.textMuted }}>
                                        {mb.kind}
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: "0.73rem", color: t.textMuted, marginTop: 2 }}>
                                {mb.user ? `${mb.user.email}` : "no owner (functional mailbox)"} · {mb.quotaMb} MB
                            </p>
                        </div>

                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Link href={`/dashboard/mail?as=${encodeURIComponent(mb.address)}`}
                                style={{ ...btnGhost(t), textDecoration: "none" }} title="Open this inbox">
                                <ExternalLink style={{ width: 13, height: 13 }} /> Open inbox
                            </Link>
                            <button onClick={() => void patch(mb.id, { resetPassword: true })}
                                disabled={busyId === mb.id} style={btnGhost(t)} title="Issue a new password">
                                <KeyRound style={{ width: 13, height: 13 }} />
                            </button>
                            <button onClick={() => void patch(mb.id, { active: !mb.active })}
                                disabled={busyId === mb.id} style={btnGhost(t)} title={mb.active ? "Suspend" : "Reactivate"}>
                                {mb.active
                                    ? <Ban style={{ width: 13, height: 13 }} />
                                    : <CheckCircle2 style={{ width: 13, height: 13, color: t.statusSuccess }} />}
                            </button>
                            <button onClick={() => void remove(mb)} disabled={busyId === mb.id}
                                style={{ ...btnGhost(t), color: t.statusError, borderColor: t.statusError }} title="Delete">
                                <Trash2 style={{ width: 13, height: 13 }} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {showCreate && (
                <CreateModal
                    t={t} domains={domains} prefill={prefill}
                    onClose={() => { setShowCreate(false); setPrefill(null); }}
                    onCreated={(c) => { setCreds(c); setShowCreate(false); setPrefill(null); void load(); }}
                />
            )}
            {creds && (
                <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                    <div style={{ ...card, padding: 24, width: "100%", maxWidth: 440 }}>
                        <h3 style={{ fontWeight: 800, fontSize: "1rem", color: t.textPrimary, marginBottom: 6 }}>Mailbox password</h3>
                        <p style={{ fontSize: "0.79rem", color: t.textMuted, marginBottom: 16 }}>
                            Shown once. Give it to the owner for their phone or desktop mail app.
                        </p>
                        <p style={{ padding: "9px 12px", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "0.85rem", fontFamily: t.fontMono, marginBottom: 8 }}>
                            {creds.address}
                        </p>
                        <p style={{ padding: "9px 12px", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "0.85rem", fontFamily: t.fontMono, wordBreak: "break-all" }}>
                            {creds.password}
                        </p>
                        <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
                            <button onClick={() => { void navigator.clipboard.writeText(`${creds.address}\n${creds.password}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
                                style={{ ...btnGhost(t), flex: 1, justifyContent: "center", padding: "10px 0" }}>
                                {copied ? <><Check style={{ width: 13, height: 13 }} /> Copied</> : <><Copy style={{ width: 13, height: 13 }} /> Copy</>}
                            </button>
                            <button onClick={() => setCreds(null)} style={{ ...btnPrimary(t), flex: 1, justifyContent: "center", padding: "10px 0" }}>Done</button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

function CreateModal({ t, domains, prefill, onClose, onCreated }: {
    t: ReturnType<typeof useThemeTokens>;
    domains: Domain[];
    prefill: { localPart: string; domain: string } | null;
    onClose: () => void;
    onCreated: (c: { address: string; password: string }) => void;
}) {
    const [localPart, setLocalPart] = useState(prefill?.localPart ?? "");
    const [domain, setDomain] = useState(prefill?.domain ?? domains[0]?.domain ?? "");
    const [quotaMb, setQuotaMb] = useState(1024);
    const [ownerEmail, setOwnerEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const submit = async () => {
        setBusy(true); setErr("");
        try {
            let userId: string | null = null;
            if (ownerEmail.trim()) {
                const r = await fetch(`/api/admin/users?search=${encodeURIComponent(ownerEmail.trim())}&limit=1`);
                if (r.ok) {
                    const d = await r.json();
                    userId = d.users?.[0]?.id ?? null;
                }
                if (!userId) { setErr(`No user found with email ${ownerEmail}`); return; }
            }
            const res = await fetch("/api/admin/mail/mailboxes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ localPart: localPart.trim().toLowerCase(), domain, quotaMb, userId }),
            });
            const d = await res.json();
            if (!res.ok) { setErr(d.error ?? "Could not create the mailbox"); return; }
            onCreated({ address: d.mailbox.address, password: d.password });
        } catch { setErr("Could not create the mailbox"); }
        finally { setBusy(false); }
    };

    const input: React.CSSProperties = {
        width: "100%", padding: "9px 12px", boxSizing: "border-box",
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.buttonRadius, color: t.textPrimary,
        fontSize: "0.85rem", fontFamily: t.fontFamily, outline: "none",
    };
    const label: React.CSSProperties = {
        fontSize: "0.7rem", fontWeight: 700, color: t.textMuted,
        textTransform: "uppercase", letterSpacing: "0.07em",
        marginBottom: 5, display: "block",
    };

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, padding: 24, width: "100%", maxWidth: 460 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                    <h3 style={{ fontWeight: 800, fontSize: "1rem", color: t.textPrimary }}>Create mailbox</h3>
                    <button onClick={onClose} style={btnGhost(t)}><X style={{ width: 13, height: 13 }} /></button>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <label style={label}>Address</label>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input value={localPart} onChange={e => setLocalPart(e.target.value)}
                            placeholder="support" style={{ ...input, flex: 1 }} />
                        <select value={domain} onChange={e => setDomain(e.target.value)} style={{ ...input, width: "auto" }}>
                            {domains.map(d => <option key={d.id} value={d.domain}>@{d.domain}</option>)}
                        </select>
                    </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <label style={label}>Owner email (optional)</label>
                    <input value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)}
                        placeholder="Leave blank for a functional mailbox" style={input} />
                </div>

                <div style={{ marginBottom: 18 }}>
                    <label style={label}>Quota (MB)</label>
                    <input type="number" value={quotaMb} min={64} max={102400}
                        onChange={e => setQuotaMb(parseInt(e.target.value, 10) || 1024)} style={input} />
                </div>

                {err && <p style={{ fontSize: "0.79rem", color: t.statusError, marginBottom: 12 }}>{err}</p>}

                <button onClick={() => void submit()} disabled={busy || !localPart.trim() || !domain}
                    style={{ ...btnPrimary(t), width: "100%", justifyContent: "center", padding: "11px 0" }}>
                    {busy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 14, height: 14 }} />}
                    Create mailbox
                </button>
            </div>
        </div>
    );
}

function btnPrimary(t: ReturnType<typeof useThemeTokens>): React.CSSProperties {
    return {
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "8px 14px", borderRadius: t.buttonRadius, border: "none",
        background: t.accentPrimary, color: t.isMono ? t.bgPrimary : "#fff",
        fontWeight: 700, fontSize: "0.8rem", cursor: "pointer",
    };
}
function btnGhost(t: ReturnType<typeof useThemeTokens>): React.CSSProperties {
    return {
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "8px 12px", borderRadius: t.buttonRadius,
        border: `1px solid ${t.borderPrimary}`, background: "transparent",
        color: t.textSecondary, fontWeight: 600, fontSize: "0.8rem", cursor: "pointer",
    };
}
