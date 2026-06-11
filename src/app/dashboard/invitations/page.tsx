"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    Ticket, Plus, Copy, CheckCircle2, AlertCircle, Loader2, RefreshCw, Users,
} from "lucide-react";

interface RedemptionData {
    id: string;
    userId: string;
    redeemedAt: string;
    context: string;
}

interface InviteCode {
    id: string;
    code: string;
    maxUses: number;
    usedCount: number;
    active: boolean;
    expiresAt: string | null;
    createdAt: string;
    redemptions: RedemptionData[];
}

export default function InvitationsPage() {
    const t = useThemeTokens();
    const { data: session } = useSession();
    const [codes, setCodes] = useState<InviteCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [copied, setCopied] = useState<string | null>(null);
    const [canInvite, setCanInvite] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/invitations");
            if (res.ok) {
                const d = await res.json();
                setCodes(d.codes ?? []);
                setCanInvite(true);
            } else if (res.status === 403) {
                setCanInvite(false);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const generate = async () => {
        setGenerating(true);
        setError("");
        try {
            const res = await fetch("/api/invitations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            if (res.ok) {
                const d = await res.json();
                setSuccess(`Code generated: ${d.code}`);
                setTimeout(() => setSuccess(""), 4000);
                load();
            } else {
                const d = await res.json();
                setError(d.error || "Failed to generate code");
            }
        } catch { setError("Generation failed"); }
        finally { setGenerating(false); }
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopied(code);
        setTimeout(() => setCopied(null), 2000);
    };

    /* ── Styles ────────────────────────────────────────────────── */
    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };
    const thStyle: React.CSSProperties = {
        padding: "10px 14px", textAlign: "left" as const, fontSize: "0.68rem",
        fontWeight: 700, color: t.textMuted, textTransform: "uppercase" as const,
        letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}`,
        whiteSpace: "nowrap" as const,
    };
    const tdStyle: React.CSSProperties = {
        padding: "10px 14px", borderBottom: `1px solid ${t.borderSecondary}`,
        fontSize: "0.84rem", color: t.textSecondary,
    };

    if (loading) {
        return (
            <div style={{ padding: "60px", textAlign: "center", color: t.textMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: "100vh" }}>
                <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
                Loading...
            </div>
        );
    }

    if (!canInvite) {
        return (
            <div style={{ padding: "60px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
                <div style={{ ...card, padding: "40px", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
                    <Ticket style={{ width: 40, height: 40, color: t.textMuted, margin: "0 auto 16px" }} />
                    <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
                        Invitations Not Enabled
                    </h2>
                    <p style={{ fontSize: "0.85rem", color: t.textMuted, lineHeight: 1.5 }}>
                        Your account does not have invitation privileges enabled.
                        Contact an administrator to request access.
                    </p>
                </div>
            </div>
        );
    }

    const totalUsed = codes.reduce((a, c) => a + c.usedCount, 0);
    const totalMax = codes.reduce((a, c) => a + c.maxUses, 0);

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 4 }}>
                    Dashboard &bull; Invitations
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: t.accentPrimaryMuted,
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <Ticket style={{ width: 20, height: 20, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>
                                Invitation Codes
                            </h1>
                            <p style={{ fontSize: "0.82rem", color: t.textMuted }}>
                                Share invitation codes with friends to give them access to the free trial.
                            </p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={load} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "7px 14px", borderRadius: t.cardRadius,
                            border: `1px solid ${t.borderPrimary}`, background: "transparent",
                            color: t.textMuted, fontSize: "0.8rem", cursor: "pointer",
                        }}>
                            <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                        </button>
                        <button onClick={generate} disabled={generating} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "7px 14px", borderRadius: t.cardRadius,
                            border: "none", background: t.accentPrimary,
                            color: t.textInverse, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer",
                            opacity: generating ? 0.6 : 1,
                        }}>
                            {generating ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 13, height: 13 }} />}
                            Generate Code
                        </button>
                    </div>
                </div>
            </div>

            {/* Toasts */}
            {success && (
                <div style={{
                    padding: "10px 16px", borderRadius: t.cardRadius,
                    background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`,
                    color: t.statusSuccess, marginBottom: 16, fontSize: "0.875rem",
                    display: "flex", alignItems: "center", gap: 8,
                }}>
                    <CheckCircle2 style={{ width: 14, height: 14 }} />{success}
                </div>
            )}
            {error && (
                <div style={{
                    padding: "10px 16px", borderRadius: t.cardRadius,
                    background: t.statusErrorBg, border: `1px solid ${t.statusError}33`,
                    color: t.statusError, marginBottom: 16, fontSize: "0.875rem",
                    display: "flex", alignItems: "center", gap: 8,
                }}>
                    <AlertCircle style={{ width: 14, height: 14 }} />{error}
                </div>
            )}

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                    { label: "Total Codes", val: codes.length, color: t.accentPrimary },
                    { label: "Total Redeemed", val: totalUsed, color: t.statusSuccess },
                    { label: "Remaining Capacity", val: totalMax - totalUsed, color: t.accentSecondary },
                ].map(s => (
                    <div key={s.label} style={{ ...card, padding: "16px 20px" }}>
                        <p style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{s.label}</p>
                        <p style={{ fontSize: "1.6rem", fontWeight: 800, color: s.color }}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Codes Table */}
            <div style={card}>
                <div style={{
                    padding: "14px 18px", borderBottom: `1px solid ${t.borderSecondary}`,
                    display: "flex", alignItems: "center", gap: 8,
                }}>
                    <Users style={{ width: 16, height: 16, color: t.accentPrimary }} />
                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>
                        Your Codes
                    </span>
                </div>

                {codes.length === 0 ? (
                    <div style={{ padding: "40px", textAlign: "center", color: t.textMuted, fontSize: "0.85rem" }}>
                        No invitation codes yet. Click &ldquo;Generate Code&rdquo; to create one.
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ background: t.bgSecondary }}>
                                    {["Code", "Usage", "Created", "Status", ""].map(h => (
                                        <th key={h} style={thStyle}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {codes.map(c => {
                                    const pct = Math.min(100, (c.usedCount / c.maxUses) * 100);
                                    const isExhausted = c.usedCount >= c.maxUses;
                                    return (
                                        <tr key={c.id}>
                                            <td style={{ ...tdStyle, fontFamily: t.fontMono, fontWeight: 700, color: t.textPrimary, letterSpacing: "0.04em" }}>
                                                {c.code}
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                    <div style={{ width: 80, height: 8, borderRadius: 4, background: `${t.textMuted}20`, overflow: "hidden" }}>
                                                        <div style={{
                                                            width: `${pct}%`, height: "100%", borderRadius: 4,
                                                            background: isExhausted ? t.statusError : pct > 70 ? t.statusWarning : t.statusSuccess,
                                                            transition: "width 0.3s",
                                                        }} />
                                                    </div>
                                                    <span style={{ fontSize: "0.82rem", fontFamily: t.fontMono, color: t.textSecondary, fontWeight: 600 }}>
                                                        {c.usedCount}/{c.maxUses}
                                                    </span>
                                                </div>
                                            </td>
                                            <td style={{ ...tdStyle, fontSize: "0.78rem" }}>
                                                {new Date(c.createdAt).toLocaleDateString()}
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    padding: "2px 8px", borderRadius: 4, fontSize: "0.68rem", fontWeight: 700,
                                                    background: !c.active ? t.statusErrorBg : isExhausted ? `${t.textMuted}18` : t.statusSuccessBg,
                                                    color: !c.active ? t.statusError : isExhausted ? t.textMuted : t.statusSuccess,
                                                }}>
                                                    {!c.active ? "Disabled" : isExhausted ? "Exhausted" : "Active"}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                <button
                                                    onClick={() => copyCode(c.code)}
                                                    style={{
                                                        display: "flex", alignItems: "center", gap: 4,
                                                        padding: "4px 10px", borderRadius: 4,
                                                        border: `1px solid ${t.borderPrimary}`,
                                                        background: "transparent", cursor: "pointer",
                                                        color: copied === c.code ? t.statusSuccess : t.textMuted,
                                                        fontSize: "0.72rem", fontWeight: 600,
                                                        transition: "all 0.2s",
                                                    }}
                                                >
                                                    {copied === c.code ? (
                                                        <><CheckCircle2 style={{ width: 11, height: 11 }} /> Copied</>
                                                    ) : (
                                                        <><Copy style={{ width: 11, height: 11 }} /> Copy</>
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
