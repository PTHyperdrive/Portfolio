"use client";

import { useState, useEffect, useCallback, Fragment } from "react";

interface LogEntry {
    id: string;
    action: string;
    service: string;
    status: string;
    ipAddress: string | null;
    userAgent: string | null;
    details: Record<string, unknown> | null;
    createdAt: string;
    user: { email: string; name: string | null };
}

const statusColor = (s: string) =>
    s === "Success"
        ? { bg: "rgba(16,185,129,0.15)", color: "#10b981", dot: "#10b981" }
        : { bg: "rgba(239,68,68,0.15)", color: "#ef4444", dot: "#ef4444" };

const serviceColor = (s: string): string => {
    const map: Record<string, string> = {
        Compute: "#3b82f6", Auth: "#8b5cf6", Billing: "#f59e0b",
        VPN: "#06b6d4", Network: "#10b981",
    };
    return map[s] ?? "#64748b";
};

function fmtDate(s: string) {
    return new Date(s).toLocaleString("en-US", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

/** IP shown blurred by default, revealed on hover */
function BlurredIP({ ip }: { ip: string | null }) {
    if (!ip) return <span style={{ color: "#475569" }}>—</span>;
    return (
        <span
            className="blurred-ip"
            title="Hover to reveal IP"
            style={{
                fontFamily: "monospace",
                fontSize: "0.875rem",
                color: "#e2e8f0",
                filter: "blur(4px)",
                transition: "filter 0.2s ease",
                cursor: "pointer",
                userSelect: "none",
            }}
        >
            {ip}
        </span>
    );
}

export default function ActivityLogPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const PAGE_SIZE = 10;

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
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(1); }, [load]);

    const filtered = logs.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.service.toLowerCase().includes(search.toLowerCase()) ||
        l.status.toLowerCase().includes(search.toLowerCase())
    );

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const col = {
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16,
        backgroundColor: "#161b22",
        overflow: "hidden" as const,
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: "#0d1117" }}>
            {/* Global style for IP blur hover */}
            <style>{`
                .blurred-ip:hover { filter: blur(0px) !important; user-select: text !important; }
            `}</style>

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: "#475569", marginBottom: 6 }}>
                    Dashboard &nbsp;•&nbsp; Activity Log
                </p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f1f5f9" }}>Activity Log</h1>
            </div>

            {/* Card */}
            <div style={col}>
                {/* Card header */}
                <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                    </div>
                    <div>
                        <p style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.95rem" }}>Activity Log</p>
                        <p style={{ color: "#64748b", fontSize: "0.8rem" }}>View and track all activities performed on your account</p>
                    </div>
                </div>

                {/* Search */}
                <div style={{ padding: "16px 24px", display: "flex", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ position: "relative" as const, flex: 1 }}>
                        <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" as const }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search activities..."
                            style={{ width: "100%", paddingLeft: 36, padding: "9px 12px 9px 36px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#e2e8f0", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" as const }}
                        />
                    </div>
                </div>

                {error && (
                    <div style={{ margin: 20, padding: "12px 16px", background: "rgba(239,68,68,0.1)", borderRadius: 8, color: "#ef4444", fontSize: "0.85rem" }}>
                        {error}
                    </div>
                )}

                {/* Table */}
                {loading ? (
                    <div style={{ padding: 60, textAlign: "center" as const, color: "#475569" }}>Loading activity…</div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
                        <thead>
                            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                                {["Activity", "Service", "User", "Created At", "Status", ""].map(h => (
                                    <th key={h} style={{ padding: "12px 20px", textAlign: "left" as const, fontSize: "0.75rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: "48px 20px", textAlign: "center" as const, color: "#475569", fontSize: "0.9rem" }}>
                                        No activity recorded yet.
                                    </td>
                                </tr>
                            ) : filtered.map(log => {
                                const sc = statusColor(log.status);
                                const svc = serviceColor(log.service);
                                const isOpen = expanded === log.id;
                                return (
                                    <Fragment key={log.id}>
                                        <tr
                                            key={log.id}
                                            onClick={() => setExpanded(isOpen ? null : log.id)}
                                            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.1s", background: isOpen ? "rgba(59,130,246,0.04)" : "transparent" }}
                                            onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.02)"; }}
                                            onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                                        >
                                            {/* Activity */}
                                            <td style={{ padding: "14px 20px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                    <div style={{ width: 36, height: 36, borderRadius: 8, background: `${svc}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={svc} strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                                                    </div>
                                                    <div>
                                                        <p style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.9rem" }}>{log.action}</p>
                                                        <p style={{ color: "#475569", fontSize: "0.75rem", fontFamily: "monospace" }}>{log.id.substring(0, 26)}…</p>
                                                    </div>
                                                </div>
                                            </td>
                                            {/* Service */}
                                            <td style={{ padding: "14px 20px" }}>
                                                <p style={{ fontWeight: 700, color: svc, fontSize: "0.875rem" }}>{log.service}</p>
                                            </td>
                                            {/* User */}
                                            <td style={{ padding: "14px 20px" }}>
                                                <p style={{ color: "#e2e8f0", fontSize: "0.875rem" }}>{log.user.email}</p>
                                                {/* IP shown blurred under email */}
                                                <BlurredIP ip={log.ipAddress} />
                                            </td>
                                            {/* Date */}
                                            <td style={{ padding: "14px 20px", color: "#94a3b8", fontSize: "0.875rem" }}>
                                                {fmtDate(log.createdAt)}
                                            </td>
                                            {/* Status */}
                                            <td style={{ padding: "14px 20px" }}>
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: sc.bg, color: sc.color, fontSize: "0.78rem", fontWeight: 700 }}>
                                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot }} />
                                                    {log.status}
                                                </span>
                                            </td>
                                            {/* Expand */}
                                            <td style={{ padding: "14px 16px", color: "#475569" }}>
                                                <svg style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                                            </td>
                                        </tr>

                                        {/* Expanded Detail Row */}
                                        {isOpen && (
                                            <tr key={`${log.id}-detail`}>
                                                <td colSpan={6} style={{ padding: "0 20px 16px", background: "rgba(59,130,246,0.03)" }}>
                                                    <div style={{ padding: 20, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
                                                        <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Activity Details</p>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                                            <div>
                                                                <p style={{ fontSize: "0.72rem", color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>IP Address</p>
                                                                <BlurredIP ip={log.ipAddress} />
                                                            </div>
                                                            <div>
                                                                <p style={{ fontSize: "0.72rem", color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>User Agent</p>
                                                                <p style={{ fontSize: "0.8rem", color: "#94a3b8", wordBreak: "break-all" }}>{log.userAgent ?? "—"}</p>
                                                            </div>
                                                        </div>
                                                        {log.details && (
                                                            <div style={{ marginTop: 16 }}>
                                                                <p style={{ fontSize: "0.72rem", color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Details</p>
                                                                <pre style={{ padding: 14, background: "rgba(0,0,0,0.3)", borderRadius: 8, fontSize: "0.78rem", color: "#94a3b8", overflowX: "auto", fontFamily: "monospace" }}>
                                                                    {JSON.stringify(log.details, null, 2)}
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
                    <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <p style={{ fontSize: "0.8rem", color: "#475569" }}>
                            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button disabled={page <= 1} onClick={() => load(page - 1)}
                                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: page <= 1 ? "#475569" : "#e2e8f0", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: "0.85rem" }}>
                                ←
                            </button>
                            <button disabled={page >= totalPages} onClick={() => load(page + 1)}
                                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: page >= totalPages ? "#475569" : "#e2e8f0", cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: "0.85rem" }}>
                                →
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
