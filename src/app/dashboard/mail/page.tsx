"use client";

/**
 * Webmail — the user's inbox, and an admin's view into any other inbox.
 *
 * Three states, per the operator's spec:
 *   1. No mailbox  → a warning card offering to create one.
 *   2. Mailbox     → folders, message list, reader, delete.
 *   3. ?as=address → admin impersonation banner (server-side authorised
 *                    and audited; the parameter alone grants nothing).
 */

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useIsMobile } from "@/lib/useIsMobile";
import {
    Mail, Inbox, Send, Trash2, FileText, AlertTriangle, Loader2, RefreshCw,
    Shield, KeyRound, Copy, Check, ArrowLeft, Paperclip, X, Settings,
} from "lucide-react";

interface MailboxInfo {
    id: string; address: string; localPart: string; quotaMb: number;
    active: boolean; createdAt: string; lastLoginAt: string | null;
    domain: { domain: string };
}
interface Folder { path: string; name: string; exists: number; unseen: number }
interface MsgSummary {
    uid: number; subject: string; from: string; fromName: string;
    date: string | null; seen: boolean; hasAttachments: boolean; size: number;
}
interface MsgDetail extends MsgSummary {
    to: string; text: string; html: string | null;
    attachments: { filename: string; contentType: string; size: number }[];
}

const FOLDER_ICONS: Record<string, typeof Inbox> = {
    INBOX: Inbox, Sent: Send, Trash: Trash2, Drafts: FileText, Junk: AlertTriangle,
};

function MailPageInner() {
    const t = useThemeTokens();
    const isMobile = useIsMobile();
    const params = useSearchParams();
    const asAddress = params?.get("as") ?? null;

    const [loading, setLoading] = useState(true);
    const [mailbox, setMailbox] = useState<MailboxInfo | null>(null);
    const [availableDomain, setAvailableDomain] = useState("");
    const [serverConfigured, setServerConfigured] = useState(true);

    const [folders, setFolders] = useState<Folder[]>([]);
    const [folder, setFolder] = useState("INBOX");
    const [messages, setMessages] = useState<MsgSummary[]>([]);
    const [listLoading, setListLoading] = useState(false);
    const [openMsg, setOpenMsg] = useState<MsgDetail | null>(null);
    const [msgLoading, setMsgLoading] = useState(false);
    const [error, setError] = useState("");
    const [impersonating, setImpersonating] = useState(false);
    const [activeAddress, setActiveAddress] = useState("");

    const [creating, setCreating] = useState(false);
    const [newCreds, setNewCreds] = useState<{ address: string; password: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [busy, setBusy] = useState(false);

    const qs = useCallback((extra: Record<string, string> = {}) => {
        const p = new URLSearchParams(extra);
        if (asAddress) p.set("as", asAddress);
        return p.toString() ? `?${p}` : "";
    }, [asAddress]);

    /** Own-mailbox metadata. Skipped when an admin is viewing someone else. */
    const loadMailbox = useCallback(async () => {
        if (asAddress) { setLoading(false); return; }
        try {
            const res = await fetch("/api/mail/mailbox");
            const data = await res.json();
            setMailbox(data.mailbox);
            setAvailableDomain(data.availableDomain ?? "");
            setServerConfigured(data.serverConfigured !== false);
        } catch { setError("Could not load your mailbox."); }
        finally { setLoading(false); }
    }, [asAddress]);

    const loadMessages = useCallback(async (targetFolder = folder) => {
        setListLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/mail/messages${qs({ mailbox: targetFolder })}`);
            if (res.status === 404) {
                const d = await res.json().catch(() => ({}));
                if (d.error === "NO_MAILBOX") { setMessages([]); return; }
            }
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError(d.error ?? "Could not load messages.");
                return;
            }
            const data = await res.json();
            setMessages(data.messages ?? []);
            setFolders(data.folders ?? []);
            setImpersonating(!!data.impersonating);
            setActiveAddress(data.address ?? "");
        } catch { setError("Could not reach the mail server."); }
        finally { setListLoading(false); }
    }, [folder, qs]);

    useEffect(() => { void loadMailbox(); }, [loadMailbox]);
    useEffect(() => {
        if (asAddress || mailbox) void loadMessages(folder);
    }, [asAddress, mailbox, folder, loadMessages]);

    const openMessage = async (uid: number) => {
        setMsgLoading(true);
        try {
            const res = await fetch(`/api/mail/messages/${uid}${qs({ mailbox: folder })}`);
            if (!res.ok) { setError("Could not open that message."); return; }
            const data = await res.json();
            setOpenMsg(data.message);
            setMessages(prev => prev.map(m => m.uid === uid ? { ...m, seen: true } : m));
        } catch { setError("Could not open that message."); }
        finally { setMsgLoading(false); }
    };

    const deleteMessage = async (uid: number) => {
        try {
            const res = await fetch(`/api/mail/messages/${uid}${qs({ mailbox: folder })}`, { method: "DELETE" });
            if (!res.ok) { setError("Could not delete that message."); return; }
            setMessages(prev => prev.filter(m => m.uid !== uid));
            if (openMsg?.uid === uid) setOpenMsg(null);
        } catch { setError("Could not delete that message."); }
    };

    const createMailbox = async () => {
        setCreating(true);
        setError("");
        try {
            const res = await fetch("/api/mail/mailbox", { method: "POST" });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? "Could not create your inbox."); return; }
            setNewCreds({ address: data.mailbox.address, password: data.password });
            await loadMailbox();
        } catch { setError("Could not create your inbox."); }
        finally { setCreating(false); }
    };

    const resetPassword = async () => {
        setBusy(true);
        try {
            const res = await fetch("/api/mail/mailbox/password", { method: "POST" });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? "Could not reset the password."); return; }
            setNewCreds({ address: data.address, password: data.password });
        } finally { setBusy(false); }
    };

    const deleteMailbox = async () => {
        if (!confirm("Delete your mailbox and every message in it? This cannot be undone.")) return;
        setBusy(true);
        try {
            const res = await fetch("/api/mail/mailbox", { method: "DELETE" });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError(d.error ?? "Could not delete the mailbox.");
                return;
            }
            setMailbox(null); setMessages([]); setShowSettings(false); setOpenMsg(null);
        } finally { setBusy(false); }
    };

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
    };

    if (loading) {
        return (
            <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
                <Loader2 style={{ width: 28, height: 28, color: t.accentPrimary, animation: "spin 1s linear infinite" }} />
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        );
    }

    // ── State 1: no mailbox yet ──────────────────────────────────
    if (!asAddress && !mailbox) {
        return (
            <div style={{ padding: isMobile ? "20px 16px" : "28px 36px", minHeight: "100vh", background: t.bgPrimary, fontFamily: t.fontFamily }}>
                <h1 style={{ fontSize: "1.55rem", fontWeight: 800, color: t.textPrimary, marginBottom: 22 }}>Email</h1>
                <div style={{ ...card, maxWidth: 620, padding: 28, textAlign: "center" }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
                        background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <AlertTriangle style={{ width: 26, height: 26, color: t.statusWarning }} />
                    </div>
                    <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: t.textPrimary, marginBottom: 8 }}>
                        You don&apos;t have an inbox yet
                    </h2>
                    <p style={{ fontSize: "0.85rem", color: t.textMuted, lineHeight: 1.6, marginBottom: 20 }}>
                        Create your mailbox to send and receive email at{" "}
                        <strong style={{ color: t.textSecondary }}>@{availableDomain}</strong>.
                        Your address is generated from your account. You get one mailbox,
                        and you can delete it at any time.
                    </p>
                    {!serverConfigured && (
                        <p style={{ fontSize: "0.78rem", color: t.statusWarning, marginBottom: 16 }}>
                            Mail service is still being configured — creation may be unavailable.
                        </p>
                    )}
                    {error && <p style={{ fontSize: "0.8rem", color: t.statusError, marginBottom: 14 }}>{error}</p>}
                    <button onClick={createMailbox} disabled={creating} style={{
                        padding: "12px 26px", borderRadius: t.buttonRadius, border: "none",
                        background: t.accentPrimary, color: t.isMono ? t.bgPrimary : "#fff",
                        fontWeight: 700, fontSize: "0.9rem", cursor: creating ? "wait" : "pointer",
                        display: "inline-flex", alignItems: "center", gap: 8,
                    }}>
                        {creating
                            ? <><Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> Creating…</>
                            : <><Mail style={{ width: 15, height: 15 }} /> Create my inbox</>}
                    </button>
                </div>
                {newCreds && <CredsModal creds={newCreds} onClose={() => setNewCreds(null)} t={t} copied={copied} setCopied={setCopied} />}
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        );
    }

    // ── State 2/3: mailbox view ──────────────────────────────────
    const shownAddress = activeAddress || mailbox?.address || asAddress || "";

    return (
        <div style={{ padding: isMobile ? "16px 12px" : "28px 36px", minHeight: "100vh", background: t.bgPrimary, fontFamily: t.fontFamily }}>
            {impersonating && (
                <div style={{
                    marginBottom: 16, padding: "10px 16px", borderRadius: t.buttonRadius,
                    background: t.statusWarningBg, border: `1px solid ${t.statusWarning}`,
                    display: "flex", alignItems: "center", gap: 10,
                }}>
                    <Shield style={{ width: 16, height: 16, color: t.statusWarning, flexShrink: 0 }} />
                    <span style={{ fontSize: "0.82rem", color: t.textPrimary }}>
                        Administrator view — you are reading <strong>{shownAddress}</strong>. This access is logged.
                    </span>
                </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: "1.55rem", fontWeight: 800, color: t.textPrimary }}>Email</h1>
                    <p style={{ fontSize: "0.82rem", color: t.textMuted, marginTop: 2 }}>{shownAddress}</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => void loadMessages(folder)} style={iconBtn(t)} title="Refresh">
                        <RefreshCw style={{ width: 15, height: 15, ...(listLoading ? { animation: "spin 1s linear infinite" } : {}) }} />
                    </button>
                    {!asAddress && (
                        <button onClick={() => setShowSettings(true)} style={iconBtn(t)} title="Mailbox settings">
                            <Settings style={{ width: 15, height: 15 }} />
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: t.buttonRadius, background: t.statusErrorBg, color: t.statusError, fontSize: "0.82rem" }}>
                    {error}
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "190px minmax(0,1fr)", gap: 16 }}>
                {/* Folders */}
                {!isMobile && (
                    <div style={{ ...card, padding: 8, alignSelf: "start" }}>
                        {(folders.length ? folders : [{ path: "INBOX", name: "INBOX", exists: 0, unseen: 0 }]).map(f => {
                            const Icon = FOLDER_ICONS[f.name] ?? Mail;
                            const active = folder === f.path;
                            return (
                                <button key={f.path} onClick={() => { setFolder(f.path); setOpenMsg(null); }} style={{
                                    width: "100%", display: "flex", alignItems: "center", gap: 9,
                                    padding: "9px 11px", border: "none", cursor: "pointer",
                                    borderRadius: t.buttonRadius, textAlign: "left",
                                    background: active ? t.accentPrimaryMuted : "transparent",
                                    color: active ? t.accentPrimary : t.textSecondary,
                                    fontWeight: active ? 700 : 500, fontSize: "0.83rem",
                                }}>
                                    <Icon style={{ width: 15, height: 15, flexShrink: 0 }} />
                                    <span style={{ flex: 1 }}>{f.name}</span>
                                    {f.unseen > 0 && (
                                        <span style={{
                                            fontSize: "0.68rem", fontWeight: 800, padding: "1px 6px",
                                            borderRadius: 9, background: t.accentPrimary,
                                            color: t.isMono ? t.bgPrimary : "#fff",
                                        }}>{f.unseen}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* List / reader */}
                <div style={{ ...card, minHeight: 420, overflow: "hidden" }}>
                    {openMsg ? (
                        <MessageReader
                            msg={openMsg} t={t} loading={msgLoading}
                            onBack={() => setOpenMsg(null)}
                            onDelete={() => void deleteMessage(openMsg.uid)}
                        />
                    ) : listLoading ? (
                        <div style={{ padding: 60, display: "flex", justifyContent: "center" }}>
                            <Loader2 style={{ width: 24, height: 24, color: t.accentPrimary, animation: "spin 1s linear infinite" }} />
                        </div>
                    ) : messages.length === 0 ? (
                        <div style={{ padding: "70px 20px", textAlign: "center" }}>
                            <Inbox style={{ width: 34, height: 34, color: t.textMuted, opacity: 0.35, margin: "0 auto 12px" }} />
                            <p style={{ fontSize: "0.86rem", color: t.textMuted }}>
                                {folder === "INBOX" ? "No messages yet." : `${folder} is empty.`}
                            </p>
                        </div>
                    ) : (
                        messages.map(m => (
                            <div key={m.uid} onClick={() => void openMessage(m.uid)} style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "12px 16px", cursor: "pointer",
                                borderBottom: `1px solid ${t.borderSecondary}`,
                                background: m.seen ? "transparent" : t.accentPrimaryMuted,
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{
                                            fontSize: "0.83rem", fontWeight: m.seen ? 500 : 800,
                                            color: t.textPrimary, whiteSpace: "nowrap",
                                            overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220,
                                        }}>{m.fromName || m.from || "(unknown sender)"}</span>
                                        {m.hasAttachments && <Paperclip style={{ width: 12, height: 12, color: t.textMuted, flexShrink: 0 }} />}
                                    </div>
                                    <p style={{
                                        fontSize: "0.82rem", color: m.seen ? t.textMuted : t.textSecondary,
                                        fontWeight: m.seen ? 400 : 600, marginTop: 2,
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                    }}>{m.subject}</p>
                                </div>
                                <span style={{ fontSize: "0.7rem", color: t.textMuted, whiteSpace: "nowrap" }}>
                                    {m.date ? new Date(m.date).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}
                                </span>
                                <button
                                    onClick={e => { e.stopPropagation(); void deleteMessage(m.uid); }}
                                    style={{ ...iconBtn(t), width: 28, height: 28 }} title="Delete"
                                >
                                    <Trash2 style={{ width: 13, height: 13 }} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {showSettings && mailbox && (
                <MailboxSettings
                    mailbox={mailbox} t={t} busy={busy}
                    onClose={() => setShowSettings(false)}
                    onReset={resetPassword}
                    onDelete={deleteMailbox}
                />
            )}
            {newCreds && <CredsModal creds={newCreds} onClose={() => setNewCreds(null)} t={t} copied={copied} setCopied={setCopied} />}
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

function iconBtn(t: ReturnType<typeof useThemeTokens>): React.CSSProperties {
    return {
        width: 34, height: 34, borderRadius: t.buttonRadius,
        border: `1px solid ${t.borderPrimary}`, background: "transparent",
        color: t.textMuted, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
    };
}

function MessageReader({ msg, t, loading, onBack, onDelete }: {
    msg: MsgDetail; t: ReturnType<typeof useThemeTokens>; loading: boolean;
    onBack: () => void; onDelete: () => void;
}) {
    return (
        <div>
            <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                borderBottom: `1px solid ${t.borderSecondary}`,
            }}>
                <button onClick={onBack} style={iconBtn(t)}><ArrowLeft style={{ width: 15, height: 15 }} /></button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: "0.95rem", color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {msg.subject}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: t.textMuted, marginTop: 2 }}>
                        {msg.fromName ? `${msg.fromName} <${msg.from}>` : msg.from}
                        {msg.date ? ` · ${new Date(msg.date).toLocaleString()}` : ""}
                    </p>
                </div>
                <button onClick={onDelete} style={iconBtn(t)} title="Delete"><Trash2 style={{ width: 14, height: 14 }} /></button>
            </div>

            {loading ? (
                <div style={{ padding: 50, display: "flex", justifyContent: "center" }}>
                    <Loader2 style={{ width: 22, height: 22, color: t.accentPrimary, animation: "spin 1s linear infinite" }} />
                </div>
            ) : (
                <div style={{ padding: 18 }}>
                    {msg.attachments.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                            {msg.attachments.map((a, i) => (
                                <span key={i} style={{
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    padding: "5px 10px", borderRadius: t.buttonRadius,
                                    background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`,
                                    fontSize: "0.75rem", color: t.textSecondary,
                                }}>
                                    <Paperclip style={{ width: 11, height: 11 }} />
                                    {a.filename} ({Math.round(a.size / 1024)} KB)
                                </span>
                            ))}
                        </div>
                    )}
                    {/* Remote HTML is not rendered: a mail body is attacker-controlled
                        and injecting it would hand any sender script in this origin. */}
                    <pre style={{
                        whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                        fontFamily: t.fontFamily, fontSize: "0.86rem",
                        lineHeight: 1.65, color: t.textSecondary,
                    }}>{msg.text || "(no plain-text body)"}</pre>
                    {msg.html && !msg.text && (
                        <p style={{ marginTop: 14, fontSize: "0.75rem", color: t.textMuted, fontStyle: "italic" }}>
                            This message is HTML-only. Plain text is shown for safety.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function CredsModal({ creds, onClose, t, copied, setCopied }: {
    creds: { address: string; password: string };
    onClose: () => void; t: ReturnType<typeof useThemeTokens>;
    copied: boolean; setCopied: (v: boolean) => void;
}) {
    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
            <div style={{
                background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
                borderRadius: t.cardRadius, padding: 26, width: "100%", maxWidth: 470,
            }}>
                <h3 style={{ fontWeight: 800, fontSize: "1.05rem", color: t.textPrimary, marginBottom: 6 }}>
                    Your mailbox is ready
                </h3>
                <p style={{ fontSize: "0.8rem", color: t.textMuted, marginBottom: 18, lineHeight: 1.55 }}>
                    Save this password now — it is shown once and cannot be recovered.
                    You only need it for phone or desktop mail apps; webmail here just works.
                </p>

                <Field label="Email address" value={creds.address} t={t} />
                <Field label="Password" value={creds.password} t={t} mono />

                <div style={{ marginTop: 14, padding: "12px 14px", background: t.bgSecondary, borderRadius: t.buttonRadius, border: `1px solid ${t.borderSecondary}` }}>
                    <p style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                        Mail app settings
                    </p>
                    <p style={{ fontSize: "0.78rem", color: t.textSecondary, lineHeight: 1.6 }}>
                        IMAP: mail.notrespond.com, port 143 (STARTTLS)<br />
                        SMTP: mail.notrespond.com, port 587 (STARTTLS)
                    </p>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                    <button onClick={() => {
                        void navigator.clipboard.writeText(`${creds.address}\n${creds.password}`);
                        setCopied(true); setTimeout(() => setCopied(false), 1800);
                    }} style={{
                        flex: 1, padding: "11px 0", borderRadius: t.buttonRadius,
                        border: `1px solid ${t.borderPrimary}`, background: "transparent",
                        color: t.textSecondary, fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    }}>
                        {copied ? <><Check style={{ width: 14, height: 14 }} /> Copied</> : <><Copy style={{ width: 14, height: 14 }} /> Copy</>}
                    </button>
                    <button onClick={onClose} style={{
                        flex: 1, padding: "11px 0", borderRadius: t.buttonRadius, border: "none",
                        background: t.accentPrimary, color: t.isMono ? t.bgPrimary : "#fff",
                        fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                    }}>I&apos;ve saved it</button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, value, t, mono }: {
    label: string; value: string; t: ReturnType<typeof useThemeTokens>; mono?: boolean;
}) {
    return (
        <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: "0.7rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
                {label}
            </p>
            <p style={{
                padding: "9px 12px", background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
                borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "0.87rem",
                fontFamily: mono ? t.fontMono : t.fontFamily, wordBreak: "break-all",
            }}>{value}</p>
        </div>
    );
}

function MailboxSettings({ mailbox, t, busy, onClose, onReset, onDelete }: {
    mailbox: MailboxInfo; t: ReturnType<typeof useThemeTokens>; busy: boolean;
    onClose: () => void; onReset: () => void; onDelete: () => void;
}) {
    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
            <div style={{
                background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
                borderRadius: t.cardRadius, padding: 24, width: "100%", maxWidth: 460,
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ fontWeight: 800, fontSize: "1.02rem", color: t.textPrimary }}>Mailbox settings</h3>
                    <button onClick={onClose} style={iconBtn(t)}><X style={{ width: 14, height: 14 }} /></button>
                </div>

                <Field label="Address" value={mailbox.address} t={t} />
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 18 }}>
                    Quota {mailbox.quotaMb} MB · created {new Date(mailbox.createdAt).toLocaleDateString()}
                </p>

                <button onClick={onReset} disabled={busy} style={{
                    width: "100%", padding: "11px 0", marginBottom: 10, borderRadius: t.buttonRadius,
                    border: `1px solid ${t.borderPrimary}`, background: "transparent",
                    color: t.textSecondary, fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                    <KeyRound style={{ width: 14, height: 14 }} /> Generate a new password
                </button>

                <button onClick={onDelete} disabled={busy} style={{
                    width: "100%", padding: "11px 0", borderRadius: t.buttonRadius,
                    border: `1px solid ${t.statusError}`, background: "transparent",
                    color: t.statusError, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                    <Trash2 style={{ width: 14, height: 14 }} /> Delete mailbox and all mail
                </button>
            </div>
        </div>
    );
}

export default function MailPage() {
    return (
        <Suspense fallback={null}>
            <MailPageInner />
        </Suspense>
    );
}
