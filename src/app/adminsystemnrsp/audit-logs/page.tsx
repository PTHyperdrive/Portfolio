"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { ScrollText, Search, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

interface LogEntry {
    id: string; action: string; resourceType: string; outcome: string;
    ipAddress: string | null; userAgent: string | null;
    metadata: Record<string, unknown> | null; createdAt: string;
    user: { email: string; name: string | null };
}

const PAGE_SIZE = 15;

function fmtDate(s: string) {
    return new Date(s).toLocaleString("en-US", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function BlurredIP({ ip, color }: { ip: string | null; color: string }) {
    if (!ip) return <span style={{ color }}>—</span>;
    return <span className="blurred-ip" title="Hover to reveal" style={{ fontFamily: "monospace", fontSize: "0.82rem", color, filter: "blur(4px)", transition: "filter 0.2s", cursor: "pointer", userSelect: "none" }}>{ip}</span>;
}

export default function AdminAuditLogsPage() {
    const t = useThemeTokens();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const statusColor = (s: string) =>
        s === "SUCCESS" ? { bg: `${t.statusSuccess}22`, color: t.statusSuccess, dot: t.statusSuccess }
        : s === "DENIED" ? { bg: `${t.statusWarning}22`, color: t.statusWarning, dot: t.statusWarning }
        : { bg: `${t.statusError}22`, color: t.statusError, dot: t.statusError };

    const resourceColor = (s: string): string => {
        const map: Record<string, string> = { VirtualMachine: t.accentPrimary, UserAccount: t.accentSecondary, Billing: t.statusWarning, Network: t.statusSuccess };
        return map[s] ?? t.textMuted;
    };

    const load = useCallback(async (p: number) => {
        setLoading(true);
        try {
            // Admin sees all users — /api/admin/logs is the RBAC-protected version
            const res = await fetch(`/api/admin/logs?page=${p}&limit=${PAGE_SIZE}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setLogs(data.logs ?? []); setTotal(data.total ?? 0); setPage(p);
        } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(1); }, [load]);

    const filtered = logs.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.resourceType.toLowerCase().includes(search.toLowerCase()) ||
        l.outcome.toLowerCase().includes(search.toLowerCase()) ||
        l.user.email.toLowerCase().includes(search.toLowerCase())
    );

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow, overflow: "hidden" };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <style>{`.blurred-ip:hover { filter: blur(0px) !important; user-select: text !important; }`}</style>

            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 4 }}>Admin System &bull; Audit Logs</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ScrollText style={{ width: 20, height: 20, color: t.statusWarning }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>Audit Logs</h1>
                        <p style={{ fontSize: "0.82rem", color: t.textMuted }}>Immutable record of all platform actions across all users.</p>
                    </div>
                </div>
            </div>

            <div style={card}>
                {/* Search */}
                <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ position: "relative", flex: 1, maxWidth: 420 }}>
                        <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: t.textMuted, pointerEvents: "none" }} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by action, resource, user, outcome…" style={{ width: "100%", paddingLeft: 30, padding: "8px 12px 8px 30px", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, color: t.textPrimary, fontSize: "0.84rem", outline: "none", boxSizing: "border-box", fontFamily: t.fontFamily }} />
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: t.textMuted }}>{total.toLocaleString()} entries</span>
                </div>

                {error && <div style={{ margin: 16, padding: "10px 14px", background: t.statusErrorBg, borderRadius: t.cardRadius, color: t.statusError, fontSize: "0.84rem" }}>{error}</div>}

                {loading ? (
                    <div style={{ padding: 60, textAlign: "center", color: t.textMuted }}>Loading audit log...</div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: t.bgSecondary }}>
                                {["Action", "Resource", "User", "Timestamp", "Outcome", ""].map(h => (
                                    <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}` }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: "48px", textAlign: "center", color: t.textMuted }}>No entries recorded yet.</td></tr>
                            ) : filtered.map(log => {
                                const sc = statusColor(log.outcome);
                                const svc = resourceColor(log.resourceType);
                                const isOpen = expanded === log.id;
                                return (
                                    <Fragment key={log.id}>
                                        <tr onClick={() => setExpanded(isOpen ? null : log.id)} style={{ borderBottom: `1px solid ${t.borderSecondary}`, cursor: "pointer", background: isOpen ? t.accentPrimaryMuted : "transparent" }}
                                            onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = t.bgCardHover; }}
                                            onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}>
                                            <td style={{ padding: "12px 18px" }}>
                                                <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.875rem" }}>{log.action.replace(/_/g, " ")}</p>
                                                <p style={{ color: t.textMuted, fontSize: "0.68rem", fontFamily: t.fontMono }}>{log.id.substring(0, 20)}…</p>
                                            </td>
                                            <td style={{ padding: "12px 18px" }}><span style={{ fontWeight: 700, color: svc, fontSize: "0.84rem" }}>{log.resourceType}</span></td>
                                            <td style={{ padding: "12px 18px" }}>
                                                <p style={{ color: t.textPrimary, fontSize: "0.84rem" }}>{log.user.name || log.user.email}</p>
                                                <BlurredIP ip={log.ipAddress} color={t.textMuted} />
                                            </td>
                                            <td style={{ padding: "12px 18px", color: t.textSecondary, fontSize: "0.82rem" }}>{fmtDate(log.createdAt)}</td>
                                            <td style={{ padding: "12px 18px" }}>
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: sc.bg, color: sc.color, fontSize: "0.72rem", fontWeight: 700 }}>
                                                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc.dot }} /> {log.outcome}
                                                </span>
                                            </td>
                                            <td style={{ padding: "12px 14px", color: t.textMuted }}>
                                                <ChevronDown style={{ width: 14, height: 14, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr>
                                                <td colSpan={6} style={{ padding: "0 18px 14px", background: t.accentPrimaryMuted }}>
                                                    <div style={{ padding: 16, background: t.bgSecondary, borderRadius: t.cardRadius, border: `1px solid ${t.borderSecondary}` }}>
                                                        <p style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Detail</p>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 10 }}>
                                                            <div><span style={{ display: "block", fontSize: "0.65rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>IP Address</span><BlurredIP ip={log.ipAddress} color={t.textPrimary} /></div>
                                                            <div><span style={{ display: "block", fontSize: "0.65rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>User Agent</span><span style={{ fontSize: "0.78rem", color: t.textSecondary, wordBreak: "break-all", lineHeight: 1.5 }}>{log.userAgent || "N/A"}</span></div>
                                                        </div>
                                                        {log.metadata && (
                                                            <pre style={{ padding: 12, background: t.bgTertiary, borderRadius: t.cardRadius, fontSize: "0.75rem", color: t.textSecondary, overflowX: "auto", fontFamily: t.fontMono }}>{JSON.stringify(log.metadata, null, 2)}</pre>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {totalPages > 1 && (
                    <div style={{ padding: "12px 20px", borderTop: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.75rem", color: t.textMuted }}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                            <button disabled={page <= 1} onClick={() => load(page - 1)} style={{ display: "flex", alignItems: "center", padding: "5px 10px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: page <= 1 ? t.textMuted : t.textSecondary, cursor: page <= 1 ? "not-allowed" : "pointer" }}><ChevronLeft style={{ width: 14, height: 14 }} /></button>
                            <button disabled={page >= totalPages} onClick={() => load(page + 1)} style={{ display: "flex", alignItems: "center", padding: "5px 10px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: page >= totalPages ? t.textMuted : t.textSecondary, cursor: page >= totalPages ? "not-allowed" : "pointer" }}><ChevronRight style={{ width: 14, height: 14 }} /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
