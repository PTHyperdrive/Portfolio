"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Clock, Search, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

interface LogEntry {
    id: string;
    action: string;
    resourceType: string;
    outcome: string;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    user: { email: string; name: string | null };
}

function fmtDate(s: string) {
    return new Date(s).toLocaleString("en-US", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function BlurredIP({ ip, color }: { ip: string | null; color: string }) {
    if (!ip) return <span style={{ color }}>—</span>;
    return (
        <span className="blurred-ip" title="Hover to reveal IP" style={{ fontFamily: "monospace", fontSize: "0.875rem", color, filter: "blur(4px)", transition: "filter 0.2s ease", cursor: "pointer", userSelect: "none" }}>
            {ip}
        </span>
    );
}

export default function AuditLogPage() {
    const t = useThemeTokens();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const PAGE_SIZE = 10;

    const statusColor = (s: string) =>
        s === "SUCCESS"
            ? { bg: `${t.statusSuccess}22`, color: t.statusSuccess, dot: t.statusSuccess }
            : s === "DENIED"
                ? { bg: `${t.statusWarning}22`, color: t.statusWarning, dot: t.statusWarning }
                : { bg: `${t.statusError}22`, color: t.statusError, dot: t.statusError };

    const resourceColor = (s: string): string => {
        const map: Record<string, string> = {
            VirtualMachine: t.accentPrimary, UserAccount: t.accentSecondary, Billing: t.statusWarning, Network: t.statusSuccess,
        };
        return map[s] ?? t.textMuted;
    };

    const load = useCallback(async (p: number) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/activity?page=${p}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setLogs(data.logs ?? []);
            setTotal(data.total ?? 0);
            setPage(p);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(1); }, [load]);

    const filtered = logs.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.resourceType.toLowerCase().includes(search.toLowerCase()) ||
        l.outcome.toLowerCase().includes(search.toLowerCase())
    );

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow, overflow: "hidden" };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <style>{`.blurred-ip:hover { filter: blur(0px) !important; user-select: text !important; }`}</style>

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Dashboard <span>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Audit Log</span>
                </p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Audit Log</h1>
            </div>

            {/* Card */}
            <div style={card}>
                {/* Card header */}
                <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Clock style={{ width: 20, height: 20, color: t.accentPrimary }} />
                    </div>
                    <div>
                        <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>Audit Log</p>
                        <p style={{ color: t.textMuted, fontSize: "0.8rem" }}>Immutable record of all actions performed on your account (ISO 27001)</p>
                    </div>
                </div>

                {/* Search */}
                <div style={{ padding: "16px 24px", display: "flex", gap: 12, borderBottom: `1px solid ${t.borderSecondary}` }}>
                    <div style={{ position: "relative", flex: 1 }}>
                        <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: t.textMuted, pointerEvents: "none" }} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activities..." style={{ width: "100%", paddingLeft: 36, padding: "9px 12px 9px 36px", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.isMono ? 4 : 8, color: t.textPrimary, fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }} />
                    </div>
                </div>

                {error && <div style={{ margin: 20, padding: "12px 16px", background: t.statusErrorBg, borderRadius: t.isMono ? 4 : 8, color: t.statusError, fontSize: "0.85rem" }}>{error}</div>}

                {/* Table */}
                {loading ? (
                    <div style={{ padding: 60, textAlign: "center", color: t.textMuted }}>Loading audit log...</div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: t.bgSecondary }}>
                                {["Action", "Resource", "User", "Created At", "Outcome", ""].map(h => (
                                    <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: "0.75rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${t.borderSecondary}` }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: "48px 20px", textAlign: "center", color: t.textMuted, fontSize: "0.9rem" }}>No activity recorded yet.</td></tr>
                            ) : filtered.map(log => {
                                const sc = statusColor(log.outcome);
                                const svc = resourceColor(log.resourceType);
                                const isOpen = expanded === log.id;
                                return (
                                    <Fragment key={log.id}>
                                        <tr onClick={() => setExpanded(isOpen ? null : log.id)} style={{ borderBottom: `1px solid ${t.borderSecondary}`, cursor: "pointer", transition: "background 0.1s", background: isOpen ? t.accentPrimaryMuted : "transparent" }}
                                            onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = t.bgCardHover; }}
                                            onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}>
                                            <td style={{ padding: "14px 20px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                    <div style={{ width: 36, height: 36, borderRadius: 8, background: `${svc}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={svc} strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                                                    </div>
                                                    <div>
                                                        <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>{log.action.replace(/_/g, " ")}</p>
                                                        <p style={{ color: t.textMuted, fontSize: "0.75rem", fontFamily: t.fontMono }}>{log.id.substring(0, 26)}...</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: "14px 20px" }}><p style={{ fontWeight: 700, color: svc, fontSize: "0.875rem" }}>{log.resourceType}</p></td>
                                            <td style={{ padding: "14px 20px" }}>
                                                <p style={{ color: t.textPrimary, fontSize: "0.875rem" }}>{log.user.email}</p>
                                                <BlurredIP ip={log.ipAddress} color={t.textMuted} />
                                            </td>
                                            <td style={{ padding: "14px 20px", color: t.textSecondary, fontSize: "0.875rem" }}>{fmtDate(log.createdAt)}</td>
                                            <td style={{ padding: "14px 20px" }}>
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: sc.bg, color: sc.color, fontSize: "0.78rem", fontWeight: 700 }}>
                                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot }} /> {log.outcome}
                                                </span>
                                            </td>
                                            <td style={{ padding: "14px 16px", color: t.textMuted }}>
                                                <ChevronDown style={{ width: 16, height: 16, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                                            </td>
                                        </tr>

                                        {isOpen && (
                                            <tr>
                                                <td colSpan={6} style={{ padding: "0 20px 16px", background: t.accentPrimaryMuted }}>
                                                    <div style={{ padding: 20, background: t.bgSecondary, borderRadius: t.isMono ? 6 : 12, border: `1px solid ${t.borderSecondary}` }}>
                                                        <p style={{ fontSize: "0.8rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Activity Details</p>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                                                            <div>
                                                                <span style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>IP Address</span>
                                                                {log.ipAddress ? <BlurredIP ip={log.ipAddress} color={t.textPrimary} /> : <span style={{ fontFamily: t.fontMono, fontSize: "0.85rem", color: t.textMuted }}>N/A</span>}
                                                            </div>
                                                            <div>
                                                                <span style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>User Agent</span>
                                                                <span style={{ fontSize: "0.8rem", color: t.textSecondary, wordBreak: "break-all", lineHeight: 1.5 }}>{log.userAgent || "N/A"}</span>
                                                            </div>
                                                        </div>
                                                        {log.metadata && (
                                                            <div>
                                                                <p style={{ fontSize: "0.72rem", color: t.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Metadata</p>
                                                                <pre style={{ padding: 14, background: t.bgTertiary, borderRadius: t.isMono ? 4 : 8, fontSize: "0.78rem", color: t.textSecondary, overflowX: "auto", fontFamily: t.fontMono }}>
                                                                    {JSON.stringify(log.metadata, null, 2)}
                                                                </pre>
                                                            </div>
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

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ padding: "14px 24px", borderTop: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <p style={{ fontSize: "0.8rem", color: t.textMuted }}>
                            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button disabled={page <= 1} onClick={() => load(page - 1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 12px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: page <= 1 ? t.textMuted : t.textPrimary, cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: "0.85rem" }}>
                                <ChevronLeft style={{ width: 16, height: 16 }} />
                            </button>
                            <button disabled={page >= totalPages} onClick={() => load(page + 1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 12px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: page >= totalPages ? t.textMuted : t.textPrimary, cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: "0.85rem" }}>
                                <ChevronRight style={{ width: 16, height: 16 }} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
