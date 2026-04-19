"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    KeyRound, Plus, X, CheckCircle, AlertCircle,
    Trash2, Loader2, Star
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────

interface SshKey {
    id: string;
    name: string;
    publicKey: string;
    isDefault: boolean;
    createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function keyType(pub: string): string {
    const prefix = pub.trim().split(" ")[0] ?? "";
    const map: Record<string, string> = {
        "ssh-ed25519":                   "Ed25519",
        "ssh-rsa":                       "RSA",
        "ecdsa-sha2-nistp256":           "ECDSA P-256",
        "ecdsa-sha2-nistp384":           "ECDSA P-384",
        "ecdsa-sha2-nistp521":           "ECDSA P-521",
        "sk-ssh-ed25519@openssh.com":    "Ed25519-SK",
        "sk-ecdsa-sha2-nistp256@openssh.com": "ECDSA-SK",
    };
    return map[prefix] ?? prefix;
}

function keyFingerprint(pub: string): string {
    // Show last 16 chars of the key body as a visual identifier
    const parts = pub.trim().split(" ");
    const body = parts[1] ?? "";
    if (body.length < 16) return body;
    return `…${body.slice(-16)}`;
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "2-digit",
    });
}

// ── Page ───────────────────────────────────────────────────────────

export default function SshKeysPage() {
    const t = useThemeTokens();
    const [keys, setKeys] = useState<SshKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Add-key form state
    const [showForm, setShowForm] = useState(false);
    const [formName, setFormName] = useState("");
    const [formKey, setFormKey] = useState("");
    const [formDefault, setFormDefault] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState<SshKey | null>(null);
    const [deleting, setDeleting] = useState(false);

    const loadKeys = useCallback(async () => {
        try {
            const res = await fetch("/api/ssh-keys");
            if (!res.ok) throw new Error("Failed to load SSH keys.");
            const data = await res.json();
            setKeys(data.keys ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadKeys(); }, [loadKeys]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");
        setSubmitting(true);

        try {
            const res = await fetch("/api/ssh-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name:       formName.trim(),
                    publicKey:  formKey.trim(),
                    setDefault: formDefault,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setFormError(data.error || "Failed to add key."); return; }
            setSuccess(`SSH key "${formName}" added.`);
            setFormName(""); setFormKey(""); setFormDefault(false); setShowForm(false);
            loadKeys();
        } catch {
            setFormError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSetDefault = async (key: SshKey) => {
        const res = await fetch(`/api/ssh-keys/${key.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ setDefault: true }),
        });
        if (res.ok) { setSuccess(`"${key.name}" set as default.`); loadKeys(); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        const res = await fetch(`/api/ssh-keys/${deleteTarget.id}`, { method: "DELETE" });
        if (res.ok) {
            setSuccess(`"${deleteTarget.name}" removed.`);
            setDeleteTarget(null);
            loadKeys();
        }
        setDeleting(false);
    };

    // ── Styles ─────────────────────────────────────────────────────
    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };
    const input: React.CSSProperties = {
        background: t.bgInput,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.isMono ? 4 : 8, color: t.textPrimary,
        fontSize: "0.875rem", outline: "none",
        padding: "9px 13px", width: "100%",
        boxSizing: "border-box" as const,
        transition: "border-color 0.15s",
        fontFamily: "inherit",
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
                <div>
                    <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>Dashboard&nbsp;&bull;&nbsp;Security</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <KeyRound style={{ width: 22, height: 22, color: t.statusWarning }} />
                        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>SSH Keys</h1>
                        {keys.length > 0 && (
                            <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: t.statusWarningBg, color: t.statusWarning }}>
                                {keys.length} / 10
                            </span>
                        )}
                    </div>
                    <p style={{ marginTop: 6, fontSize: "0.83rem", color: t.textMuted, maxWidth: 520 }}>
                        Public keys are injected into your VMs via cloud-init at provisioning time.
                        Password authentication is disabled on all VMs by default.
                    </p>
                </div>
                <button
                    id="btn-add-ssh-key"
                    onClick={() => setShowForm(v => !v)}
                    style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "10px 20px", borderRadius: t.buttonRadius, border: "none",
                        background: showForm
                            ? t.bgTertiary
                            : t.statusWarning,
                        color: showForm ? t.textSecondary : t.textInverse,
                        fontWeight: 700, fontSize: "0.875rem",
                        cursor: "pointer", boxShadow: showForm ? "none" : `0 2px 12px ${t.statusWarning}4d`,
                        transition: "all 0.15s", marginTop: 6,
                    }}
                >
                    {showForm ? (
                        <>
                            <X style={{ width: 14, height: 14 }} />
                            Cancel
                        </>
                    ) : (
                        <>
                            <Plus style={{ width: 14, height: 14 }} />
                            Add SSH Key
                        </>
                    )}
                </button>
            </div>

            {/* Toasts */}
            {success && (
                <div style={{ padding: "12px 16px", borderRadius: t.isMono ? 4 : 9, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CheckCircle style={{ width: 15, height: 15 }} /> {success}
                    </span>
                    <button onClick={() => setSuccess("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 4 }}>
                        <X style={{ width: 14, height: 14 }} />
                    </button>
                </div>
            )}
            {error && (
                <div style={{ padding: "12px 16px", borderRadius: t.isMono ? 4 : 9, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <AlertCircle style={{ width: 15, height: 15 }} /> {error}
                    </span>
                    <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 4 }}>
                        <X style={{ width: 14, height: 14 }} />
                    </button>
                </div>
            )}

            {/* Add Key Form */}
            {showForm && (
                <div style={{ ...card, padding: "24px 28px", marginBottom: 24, borderColor: `${t.statusWarning}33` }}>
                    <h2 style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 20 }}>
                        Add New SSH Public Key
                    </h2>
                    <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                            <div>
                                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: t.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    Key Name *
                                </label>
                                <input
                                    id="ssh-key-name"
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                    placeholder='e.g. "MacBook Pro" or "ePass2003 Token"'
                                    required
                                    style={input}
                                />
                            </div>
                            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                                    <div
                                        onClick={() => setFormDefault(v => !v)}
                                        style={{
                                            width: 40, height: 22, borderRadius: 11,
                                            background: formDefault ? t.statusWarning : `${t.textMuted}22`,
                                            position: "relative", cursor: "pointer", transition: "background 0.2s",
                                            flexShrink: 0,
                                        }}
                                    >
                                        <div style={{
                                            position: "absolute", top: 3,
                                            left: formDefault ? 21 : 3,
                                            width: 16, height: 16, borderRadius: "50%",
                                            background: "#fff", transition: "left 0.2s",
                                        }} />
                                    </div>
                                    <span style={{ fontSize: "0.84rem", color: t.textSecondary }}>Set as default key</span>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: t.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Public Key *
                            </label>
                            <textarea
                                id="ssh-key-public"
                                value={formKey}
                                onChange={e => setFormKey(e.target.value)}
                                placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI… your_email@example.com"
                                required
                                rows={4}
                                style={{ ...input, fontFamily: t.fontMono, fontSize: "0.8rem", resize: "vertical" }}
                            />
                            <p style={{ marginTop: 6, fontSize: "0.72rem", color: t.textMuted }}>
                                Supported: Ed25519 (recommended) · RSA · ECDSA · SK-Ed25519 (hardware token)
                            </p>
                        </div>

                        {formError && (
                            <div style={{ padding: "10px 14px", borderRadius: t.isMono ? 4 : 8, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, fontSize: "0.84rem" }}>
                                {formError}
                            </div>
                        )}

                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                            <button type="button" onClick={() => setShowForm(false)}
                                style={{ padding: "9px 20px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.875rem", cursor: "pointer" }}>
                                Cancel
                            </button>
                            <button type="submit" id="btn-ssh-key-submit" disabled={submitting}
                                style={{ padding: "9px 24px", borderRadius: t.buttonRadius, border: "none", background: submitting ? `${t.statusWarning}80` : t.statusWarning, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: submitting ? "not-allowed" : "pointer" }}>
                                {submitting ? "Adding…" : "Add Key"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Key List */}
            <div style={card}>
                {loading ? (
                    <div style={{ padding: "40px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, color: t.textMuted, fontSize: "0.875rem" }}>
                        <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                        Loading keys…
                    </div>
                ) : keys.length === 0 ? (
                    <div style={{ padding: "60px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
                        <div style={{ width: 80, height: 80, borderRadius: t.isMono ? 16 : 20, background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <KeyRound style={{ width: 36, height: 36, color: t.statusWarning }} />
                        </div>
                        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: t.textPrimary }}>No SSH keys yet</h2>
                        <p style={{ color: t.textMuted, fontSize: "0.875rem", maxWidth: 360, lineHeight: 1.6 }}>
                            Add your first public key to enable secure, passwordless access to your VMs.
                        </p>
                        <button onClick={() => setShowForm(true)}
                            style={{ padding: "10px 24px", borderRadius: t.buttonRadius, border: "none", background: t.statusWarning, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: "pointer" }}>
                            Add SSH Key
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Table header */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px 120px auto", gap: 0, padding: "10px 24px", borderBottom: `1px solid ${t.borderSecondary}`, background: t.bgSecondary }}>
                            {["Name / Fingerprint", "Type", "Added", "Status", "Actions"].map(h => (
                                <span key={h} style={{ fontSize: "0.7rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</span>
                            ))}
                        </div>

                        {keys.map((key, idx) => (
                            <div key={key.id}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 160px 120px 120px auto",
                                    alignItems: "center",
                                    padding: "16px 24px",
                                    borderBottom: idx < keys.length - 1 ? `1px solid ${t.borderSecondary}` : "none",
                                    transition: "background 0.12s",
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = t.bgCardHover}
                                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                            >
                                {/* Name + fingerprint */}
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>{key.name}</span>
                                        {key.isDefault && (
                                            <span style={{ padding: "1px 8px", borderRadius: 10, fontSize: "0.65rem", fontWeight: 700, background: t.statusWarningBg, color: t.statusWarning }}>
                                                DEFAULT
                                            </span>
                                        )}
                                    </div>
                                    <span style={{ fontFamily: t.fontMono, fontSize: "0.72rem", color: t.textMuted, marginTop: 3, display: "block" }}>
                                        {keyFingerprint(key.publicKey)}
                                    </span>
                                </div>

                                {/* Type badge */}
                                <span style={{ padding: "3px 10px", borderRadius: 6, background: t.accentPrimaryMuted, color: t.accentPrimary, fontSize: "0.75rem", fontWeight: 600, width: "fit-content" }}>
                                    {keyType(key.publicKey)}
                                </span>

                                {/* Date */}
                                <span style={{ fontSize: "0.8rem", color: t.textMuted }}>{formatDate(key.createdAt)}</span>

                                {/* Status */}
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.statusSuccess }} />
                                    <span style={{ fontSize: "0.78rem", color: t.statusSuccess, fontWeight: 600 }}>Active</span>
                                </div>

                                {/* Actions */}
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    {!key.isDefault && (
                                        <button title="Set as default" onClick={() => handleSetDefault(key)}
                                            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: t.buttonRadius, border: `1px solid ${t.statusWarning}33`, background: t.statusWarningBg, color: t.statusWarning, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                                            <Star style={{ width: 11, height: 11 }} />
                                            Set default
                                        </button>
                                    )}
                                    <button title="Delete key" onClick={() => setDeleteTarget(key)}
                                        style={{ width: 32, height: 32, borderRadius: t.buttonRadius, border: `1px solid ${t.statusError}33`, background: t.statusErrorBg, color: t.statusError, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Trash2 style={{ width: 13, height: 13 }} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                    <div style={{ ...card, padding: "28px 32px", width: 420, borderColor: `${t.statusError}33` }}>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: t.textPrimary, marginBottom: 10 }}>Remove SSH Key</h3>
                        <p style={{ fontSize: "0.875rem", color: t.textSecondary, lineHeight: 1.6 }}>
                            Remove <strong style={{ color: t.textPrimary }}>&quot;{deleteTarget.name}&quot;</strong>?
                            VMs already using this key will not be affected, but future VMs will not receive it.
                        </p>
                        <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
                            <button onClick={() => setDeleteTarget(null)}
                                style={{ padding: "9px 20px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.875rem", cursor: "pointer" }}>
                                Cancel
                            </button>
                            <button id="btn-confirm-delete-ssh" onClick={handleDelete} disabled={deleting}
                                style={{ padding: "9px 20px", borderRadius: t.buttonRadius, border: "none", background: t.statusError, color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: deleting ? "not-allowed" : "pointer" }}>
                                {deleting ? "Removing…" : "Remove Key"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
