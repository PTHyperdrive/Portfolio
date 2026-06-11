"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Receipt, Search, RefreshCw, X, ChevronLeft, ChevronRight, Users } from "lucide-react";

interface Transaction {
    id: string; plan: string; amount: number; method: string;
    status: string; createdAt: string;
    user: { id: string; name: string | null; email: string };
}
interface PageMeta { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean; }
interface Summary { totalRevenue: number; completedCount: number; }

interface UserUsage {
    id: string; name: string | null; email: string; role: string;
    credits: number; activePlan: string | null;
    vmCount: number; runningVms: number;
    burnPerHour: number; runwayHours: number | null;
    totalVmHours: number; totalHourlySpent: number;
}

const STATUS_META: Record<string, { color: string; bg: string }> = {
    completed: { color: "#81c995", bg: "rgba(129,201,149,0.12)" },
    pending:   { color: "#fdd663", bg: "rgba(253,214,99,0.12)"  },
    failed:    { color: "#f28b82", bg: "rgba(242,139,130,0.12)" },
    refunded:  { color: "#8ab4f8", bg: "rgba(138,180,248,0.12)" },
};

export default function AdminBillingPage() {
    const t = useThemeTokens();
    const [txns, setTxns] = useState<Transaction[]>([]);
    const [meta, setMeta] = useState<PageMeta | null>(null);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    // Display mode: "invoices" (transaction list) | "users" (per-user metering)
    const [mode, setMode] = useState<"invoices" | "users">("invoices");
    const [usage, setUsage] = useState<UserUsage[]>([]);
    const [usageLoading, setUsageLoading] = useState(false);

    useEffect(() => { setPage(1); }, [search, status]);

    useEffect(() => {
        if (mode !== "users") return;
        setUsageLoading(true);
        fetch("/api/admin/billing/usage")
            .then(r => r.json())
            .then(d => { if (!d.error) setUsage(d.users ?? []); })
            .catch(() => {})
            .finally(() => setUsageLoading(false));
    }, [mode]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams({ page: String(page), search, status });
            const res = await fetch(`/api/admin/billing?${p}`);
            if (res.ok) { const d = await res.json(); setTxns(d.transactions ?? []); setMeta(d.meta); setSummary(d.summary); }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [page, search, status]);

    useEffect(() => { load(); }, [load]);

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const inp: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, color: t.textPrimary, fontSize: "0.84rem", outline: "none", padding: "7px 11px", fontFamily: t.fontFamily };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 4 }}>Admin System &bull; Billing</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Receipt style={{ width: 20, height: 20, color: t.statusWarning }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>Billing & Invoices</h1>
                            <p style={{ fontSize: "0.82rem", color: t.textMuted }}>All platform transactions across all users.</p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        {/* Display mode toggle */}
                        <div style={{ display: "flex", borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, overflow: "hidden" }}>
                            {([["invoices", "Invoices", Receipt], ["users", "Users", Users]] as const).map(([m, label, Icon]) => (
                                <button key={m} onClick={() => setMode(m)} style={{
                                    display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                                    border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
                                    background: mode === m ? t.accentPrimary : "transparent",
                                    color: mode === m ? t.textInverse : t.textMuted,
                                }}>
                                    <Icon style={{ width: 13, height: 13 }} /> {label}
                                </button>
                            ))}
                        </div>
                        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                            <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary stats */}
            {mode === "invoices" && summary && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                    {[
                        { label: "Total Revenue", val: `${(summary.totalRevenue ?? 0).toLocaleString()} VND`, color: t.statusSuccess },
                        { label: "Completed Txns", val: summary.completedCount, color: t.accentPrimary },
                        { label: "Total Txns", val: meta?.total ?? 0, color: t.textSecondary },
                    ].map(s => (
                        <div key={s.label} style={{ ...card, padding: "16px 20px" }}>
                            <p style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{s.label}</p>
                            <p style={{ fontSize: "1.4rem", fontWeight: 800, color: s.color, fontFamily: t.fontMono }}>{s.val}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Users display mode — per-user metering overview */}
            {mode === "users" && (
                <div style={card}>
                    {usageLoading ? (
                        <div style={{ padding: "40px", textAlign: "center", color: t.textMuted }}>Loading user usage...</div>
                    ) : usage.length === 0 ? (
                        <div style={{ padding: "48px", textAlign: "center", color: t.textMuted }}>No users found.</div>
                    ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr style={{ background: t.bgSecondary }}>
                                {["User", "Credits", "Plan", "VMs (running)", "Burn /hr", "Runway", "VM-hours", "Spent (hourly)"].map(h => (
                                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}`, whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                            </tr></thead>
                            <tbody>
                                {usage.map((u, idx) => (
                                    <tr key={u.id} style={{ borderBottom: idx < usage.length - 1 ? `1px solid ${t.borderSecondary}` : "none" }}
                                        onMouseEnter={e => (e.currentTarget.style.background = t.bgCardHover)}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                        <td style={{ padding: "11px 16px" }}>
                                            <p style={{ fontWeight: 600, fontSize: "0.84rem", color: t.textPrimary }}>
                                                {u.name || u.email}
                                                {u.role === "ADMIN" && <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, fontSize: "0.62rem", fontWeight: 700, background: t.statusWarningBg, color: t.statusWarning }}>ADMIN</span>}
                                            </p>
                                            <p style={{ fontSize: "0.68rem", color: t.textMuted }}>{u.email}</p>
                                        </td>
                                        <td style={{ padding: "11px 16px", fontFamily: t.fontMono, fontSize: "0.84rem", fontWeight: 700, color: t.textPrimary }}>{u.credits.toLocaleString()}</td>
                                        <td style={{ padding: "11px 16px", fontSize: "0.8rem", color: t.textSecondary }}>{u.activePlan ?? "—"}</td>
                                        <td style={{ padding: "11px 16px", fontFamily: t.fontMono, fontSize: "0.84rem", color: t.textSecondary }}>{u.vmCount} ({u.runningVms})</td>
                                        <td style={{ padding: "11px 16px", fontFamily: t.fontMono, fontSize: "0.84rem", color: u.burnPerHour > 0 ? t.statusWarning : t.textMuted }}>{u.burnPerHour.toLocaleString()}</td>
                                        <td style={{ padding: "11px 16px", fontSize: "0.8rem", color: u.runwayHours !== null && u.runwayHours <= 72 ? t.statusError : t.textSecondary }}>
                                            {u.runwayHours === null ? "—" : `${Math.floor(u.runwayHours / 24)}d ${u.runwayHours % 24}h`}
                                        </td>
                                        <td style={{ padding: "11px 16px", fontFamily: t.fontMono, fontSize: "0.84rem", color: t.textSecondary }}>{u.totalVmHours.toLocaleString()}</td>
                                        <td style={{ padding: "11px 16px", fontFamily: t.fontMono, fontSize: "0.84rem", color: t.statusSuccess }}>{u.totalHourlySpent.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Filters */}
            {mode === "invoices" && (
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: "1 1 220px" }}>
                    <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: t.textMuted, pointerEvents: "none" }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search user, plan, method…" style={{ ...inp, width: "100%", paddingLeft: 30, boxSizing: "border-box" as const }} />
                    {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t.textMuted, cursor: "pointer", display: "flex" }}><X style={{ width: 11, height: 11 }} /></button>}
                </div>
                <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                    <option value="">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                </select>
            </div>
            )}

            {/* Table */}
            {mode === "invoices" && (
            <div style={card}>
                {loading ? (
                    <div style={{ padding: "40px", textAlign: "center", color: t.textMuted }}>Loading transactions...</div>
                ) : txns.length === 0 ? (
                    <div style={{ padding: "48px", textAlign: "center", color: t.textMuted }}>No transactions found.</div>
                ) : (
                    <>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr style={{ background: t.bgSecondary }}>
                                {["User", "Plan", "Amount (VND)", "Method", "Status", "Date"].map(h => (
                                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}`, whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                            </tr></thead>
                            <tbody>
                                {txns.map((tx, idx) => {
                                    const sm = STATUS_META[tx.status] ?? { color: t.textMuted, bg: t.bgTertiary };
                                    return (
                                        <tr key={tx.id} style={{ borderBottom: idx < txns.length - 1 ? `1px solid ${t.borderSecondary}` : "none" }}
                                            onMouseEnter={e => (e.currentTarget.style.background = t.bgCardHover)}
                                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                            <td style={{ padding: "11px 16px" }}>
                                                <p style={{ fontWeight: 600, fontSize: "0.84rem", color: t.textPrimary }}>{tx.user.name || tx.user.email}</p>
                                                <p style={{ fontSize: "0.68rem", color: t.textMuted }}>{tx.user.email}</p>
                                            </td>
                                            <td style={{ padding: "11px 16px", fontSize: "0.84rem", color: t.textSecondary }}>{tx.plan}</td>
                                            <td style={{ padding: "11px 16px", fontFamily: t.fontMono, fontSize: "0.84rem", fontWeight: 700, color: t.statusSuccess }}>{Number(tx.amount).toLocaleString()}</td>
                                            <td style={{ padding: "11px 16px", fontSize: "0.78rem", color: t.textMuted, fontFamily: t.fontMono }}>{tx.method}</td>
                                            <td style={{ padding: "11px 16px" }}>
                                                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.68rem", fontWeight: 700, background: sm.bg, color: sm.color }}>{tx.status}</span>
                                            </td>
                                            <td style={{ padding: "11px 16px", fontSize: "0.75rem", color: t.textMuted }}>{new Date(tx.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Pagination */}
                        {meta && meta.totalPages > 1 && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: `1px solid ${t.borderSecondary}` }}>
                                <span style={{ fontSize: "0.75rem", color: t.textMuted }}>{((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}</span>
                                <div style={{ display: "flex", gap: 4 }}>
                                    <button disabled={!meta.hasPrevPage} onClick={() => setPage(p => p - 1)} style={{ width: 30, height: 30, borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: meta.hasPrevPage ? t.textSecondary : t.borderPrimary, cursor: meta.hasPrevPage ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft style={{ width: 14, height: 14 }} /></button>
                                    <button disabled={!meta.hasNextPage} onClick={() => setPage(p => p + 1)} style={{ width: 30, height: 30, borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: meta.hasNextPage ? t.textSecondary : t.borderPrimary, cursor: meta.hasNextPage ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight style={{ width: 14, height: 14 }} /></button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
            )}
        </div>
    );
}
