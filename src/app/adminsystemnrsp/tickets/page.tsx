"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    MessageSquare, RefreshCw, ChevronDown, CheckCircle2,
    Clock, AlertTriangle, X, FileText, Loader2, Image as ImageIcon
} from "lucide-react";

interface Ticket {
    id: string;
    title: string;
    description: string;
    imageUrls: string | null;
    status: "PENDING" | "UNSOLVED" | "SOLVED";
    priority: string;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
    user: { id: string; name: string | null; email: string };
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
    PENDING:  { label: "Pending",  color: "#fdd663", bg: "rgba(253,214,99,0.12)" },
    UNSOLVED: { label: "Unsolved", color: "#f28b82", bg: "rgba(242,139,130,0.12)" },
    SOLVED:   { label: "Solved",   color: "#81c995", bg: "rgba(129,201,149,0.12)" },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
    low: { label: "Low", color: "#81c995" }, medium: { label: "Medium", color: "#8ab4f8" },
    high: { label: "High", color: "#fdd663" }, critical: { label: "Critical", color: "#f28b82" },
};

export default function AdminTicketsPage() {
    const t = useThemeTokens();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [selected, setSelected] = useState<Ticket | null>(null);
    const [updating, setUpdating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/tickets");
            if (res.ok) { const d = await res.json(); setTickets(d.tickets ?? []); }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const changeStatus = async (id: string, status: string) => {
        setUpdating(true);
        try {
            const res = await fetch(`/api/tickets/${id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            if (res.ok) {
                load();
                if (selected?.id === id) {
                    setSelected(prev => prev ? { ...prev, status: status as Ticket["status"], resolvedAt: status === "SOLVED" ? new Date().toISOString() : null } : null);
                }
            }
        } catch { /* silent */ }
        finally { setUpdating(false); }
    };

    const filtered = filter === "all" ? tickets : tickets.filter(t => t.status === filter);
    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    const counts = { all: tickets.length, PENDING: tickets.filter(t => t.status === "PENDING").length, UNSOLVED: tickets.filter(t => t.status === "UNSOLVED").length, SOLVED: tickets.filter(t => t.status === "SOLVED").length };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>Admin System &bull; Tickets</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <MessageSquare style={{ width: 22, height: 22, color: t.statusWarning }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Ticket Management</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Review and resolve user support tickets.</p>
                        </div>
                    </div>
                    <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                        <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                    </button>
                </div>
            </div>

            {/* Stats Bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                {[{ key: "all", label: "Total", count: counts.all, color: t.accentPrimary }, { key: "PENDING", label: "Pending", count: counts.PENDING, color: "#fdd663" }, { key: "UNSOLVED", label: "Unsolved", count: counts.UNSOLVED, color: "#f28b82" }, { key: "SOLVED", label: "Solved", count: counts.SOLVED, color: "#81c995" }].map(s => (
                    <button key={s.key} onClick={() => setFilter(s.key)} style={{
                        ...card, padding: "14px 18px", cursor: "pointer", border: filter === s.key ? `2px solid ${s.color}55` : `1px solid ${t.borderPrimary}`,
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: t.textSecondary }}>{s.label}</span>
                        <span style={{ fontSize: "1.3rem", fontWeight: 800, color: s.color }}>{s.count}</span>
                    </button>
                ))}
            </div>

            {/* Ticket Table */}
            <div style={card}>
                {loading ? (
                    <div style={{ padding: 48, textAlign: "center", color: t.textMuted }}>Loading...</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "48px 24px", textAlign: "center", color: t.textMuted }}>No tickets in this category.</div>
                ) : (
                    <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 90px 90px 100px 140px", gap: 8, padding: "10px 20px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                            {["Title", "User", "Priority", "Status", "Created", "Action"].map(h => (
                                <span key={h} style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                            ))}
                        </div>
                        {filtered.map(ticket => {
                            const sm = STATUS_META[ticket.status]; const pm = PRIORITY_META[ticket.priority] ?? PRIORITY_META.medium;
                            return (
                                <div key={ticket.id} style={{ display: "grid", gridTemplateColumns: "1fr 160px 90px 90px 100px 140px", gap: 8, padding: "12px 20px", borderBottom: `1px solid ${t.borderSecondary}`, alignItems: "center" }}>
                                    <div style={{ cursor: "pointer" }} onClick={() => setSelected(ticket)}>
                                        <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.88rem" }}>{ticket.title}</p>
                                        <p style={{ fontSize: "0.68rem", color: t.textMuted, fontFamily: t.fontMono }}>#{ticket.id.slice(0, 8)}</p>
                                    </div>
                                    <span style={{ fontSize: "0.78rem", color: t.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.user.name || ticket.user.email}</span>
                                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: pm.color }}>{pm.label}</span>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 4, background: sm.bg, color: sm.color, fontSize: "0.68rem", fontWeight: 700, width: "fit-content" }}>
                                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: sm.color }} /> {sm.label}
                                    </span>
                                    <span style={{ fontSize: "0.75rem", color: t.textMuted }}>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                                    <div style={{ position: "relative" }}>
                                        <select value={ticket.status} onChange={e => changeStatus(ticket.id, e.target.value)} disabled={updating} style={{
                                            width: "100%", padding: "5px 8px", background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
                                            borderRadius: t.isMono ? 4 : 6, color: t.textPrimary, fontSize: "0.75rem", cursor: "pointer", fontFamily: t.fontFamily,
                                        }}>
                                            <option value="PENDING">Pending</option>
                                            <option value="UNSOLVED">Unsolved</option>
                                            <option value="SOLVED">Solved</option>
                                        </select>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selected && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
                    <div style={{ ...card, width: "100%", maxWidth: 700, maxHeight: "85vh", overflowY: "auto", padding: 0 }}>
                        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                                <p style={{ fontSize: "0.72rem", color: t.textMuted, fontFamily: t.fontMono }}>#{selected.id.slice(0, 8)} &mdash; {selected.user.name || selected.user.email}</p>
                                <h2 style={{ fontWeight: 800, fontSize: "1.1rem", color: t.textPrimary, marginTop: 4 }}>{selected.title}</h2>
                            </div>
                            <button onClick={() => setSelected(null)} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X style={{ width: 14, height: 14 }} /></button>
                        </div>
                        <div style={{ padding: 24 }}>
                            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                                {(() => { const sm = STATUS_META[selected.status]; return <span style={{ padding: "4px 12px", borderRadius: 6, background: sm.bg, color: sm.color, fontSize: "0.78rem", fontWeight: 700 }}>{sm.label}</span>; })()}
                                {(() => { const pm = PRIORITY_META[selected.priority] ?? PRIORITY_META.medium; return <span style={{ padding: "4px 12px", borderRadius: 6, background: t.bgTertiary, color: pm.color, fontSize: "0.78rem", fontWeight: 700 }}>{pm.label}</span>; })()}
                                <span style={{ padding: "4px 12px", borderRadius: 6, background: t.bgTertiary, color: t.textMuted, fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 4 }}>
                                    <Clock style={{ width: 11, height: 11 }} /> {new Date(selected.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                </span>
                            </div>
                            {selected.description && (
                                <div style={{ padding: "16px 20px", borderRadius: t.isMono ? 4 : 8, background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`, fontSize: "0.875rem", color: t.textSecondary, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: t.fontMono, marginBottom: 16 }}>
                                    {selected.description}
                                </div>
                            )}
                            {selected.imageUrls && (() => { try { const imgs: string[] = JSON.parse(selected.imageUrls); return imgs.length > 0 ? (<div><p style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", marginBottom: 8 }}>Evidence</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{imgs.map((img, i) => (<img key={i} src={`/api/tickets/file/${img}`} alt={`Evidence ${i+1}`} style={{ maxWidth: 200, maxHeight: 150, borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, objectFit: "cover" }} />))}</div></div>) : null; } catch { return null; } })()}
                            {/* Admin Status Controls */}
                            <div style={{ marginTop: 20, padding: "14px 18px", borderRadius: t.isMono ? 4 : 8, background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33` }}>
                                <p style={{ fontSize: "0.72rem", fontWeight: 700, color: t.statusWarning, textTransform: "uppercase", marginBottom: 8 }}>Update Status</p>
                                <div style={{ display: "flex", gap: 8 }}>
                                    {(["PENDING", "UNSOLVED", "SOLVED"] as const).map(s => {
                                        const sm = STATUS_META[s];
                                        return (
                                            <button key={s} onClick={() => changeStatus(selected.id, s)} disabled={updating || selected.status === s}
                                                style={{ flex: 1, padding: "8px 0", borderRadius: t.buttonRadius, border: selected.status === s ? `2px solid ${sm.color}` : `1px solid ${t.borderPrimary}`, background: selected.status === s ? sm.bg : "transparent", color: sm.color, fontWeight: 700, fontSize: "0.82rem", cursor: selected.status === s ? "default" : "pointer", opacity: selected.status === s ? 1 : 0.7 }}>
                                                {sm.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
