"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { MessageSquare, Plus, Clock, CheckCircle2, AlertCircle, X, ChevronRight, Send } from "lucide-react";

interface Ticket {
    id: string;
    subject: string;
    status: "open" | "in_progress" | "resolved" | "closed";
    priority: "low" | "medium" | "high" | "critical";
    createdAt: string;
    updatedAt: string;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
    open: { label: "Open", color: "#8ab4f8", bg: "rgba(138,180,248,0.12)" },
    in_progress: { label: "In Progress", color: "#fdd663", bg: "rgba(253,214,99,0.12)" },
    resolved: { label: "Resolved", color: "#81c995", bg: "rgba(129,201,149,0.12)" },
    closed: { label: "Closed", color: "#9aa0a6", bg: "rgba(154,160,166,0.12)" },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
    low: { label: "Low", color: "#81c995" },
    medium: { label: "Medium", color: "#8ab4f8" },
    high: { label: "High", color: "#fdd663" },
    critical: { label: "Critical", color: "#f28b82" },
};

export default function TicketsPage() {
    const t = useThemeTokens();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [priority, setPriority] = useState("medium");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const loadTickets = useCallback(async () => {
        try {
            const res = await fetch("/api/tickets");
            if (res.ok) {
                const data = await res.json();
                setTickets(data.tickets ?? []);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadTickets(); }, [loadTickets]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subject.trim()) { setError("Subject is required."); return; }
        setSubmitting(true); setError("");
        try {
            const res = await fetch("/api/tickets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject, body, priority }),
            });
            if (!res.ok) { const j = await res.json(); throw new Error(j.error || "Failed."); }
            setSuccess("Ticket submitted successfully.");
            setSubject(""); setBody(""); setShowCreate(false);
            loadTickets();
        } catch (err) { setError(err instanceof Error ? err.message : "Failed."); }
        finally { setSubmitting(false); }
    };

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const inputStyle: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.isMono ? 4 : 8, color: t.textPrimary, fontSize: "0.875rem", outline: "none", padding: "9px 13px", width: "100%", boxSizing: "border-box" as const };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Dashboard <span>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Tickets</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <MessageSquare style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Support Tickets</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Submit and track support requests. Our team responds within 24 hours.</p>
                        </div>
                    </div>
                    <button onClick={() => setShowCreate(!showCreate)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: "pointer" }}>
                        <Plus style={{ width: 14, height: 14 }} /> New Ticket
                    </button>
                </div>
            </div>

            {/* Toasts */}
            {success && <div style={{ padding: "12px 16px", borderRadius: t.isMono ? 4 : 9, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 style={{ width: 14, height: 14 }} /> {success}</span><button onClick={() => setSuccess("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex" }}><X style={{ width: 14, height: 14 }} /></button></div>}
            {error && <div style={{ padding: "12px 16px", borderRadius: t.isMono ? 4 : 9, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><AlertCircle style={{ width: 14, height: 14 }} /> {error}</span><button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex" }}><X style={{ width: 14, height: 14 }} /></button></div>}

            {/* Create Ticket Form */}
            {showCreate && (
                <form onSubmit={handleSubmit} style={{ ...card, padding: "24px 28px", marginBottom: 24 }}>
                    <h3 style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                        <Send style={{ width: 16, height: 16, color: t.accentPrimary }} /> Create New Ticket
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 14 }}>
                            <div>
                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Subject</label>
                                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief description of your issue" style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Priority</label>
                                <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Details</label>
                            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Describe your issue in detail..." rows={5} style={{ ...inputStyle, resize: "vertical" as const, fontFamily: "inherit" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button type="submit" disabled={submitting} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: t.buttonRadius, border: "none", background: submitting ? t.textMuted : t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: submitting ? "not-allowed" : "pointer" }}>
                                <Send style={{ width: 14, height: 14 }} /> {submitting ? "Submitting..." : "Submit Ticket"}
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* Tickets List */}
            <div style={card}>
                <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>Your Tickets</span>
                    <span style={{ padding: "2px 10px", borderRadius: 10, background: t.accentPrimaryMuted, color: t.accentPrimary, fontSize: "0.72rem", fontWeight: 700 }}>{tickets.length} total</span>
                </div>

                {loading ? (
                    <div style={{ padding: 48, textAlign: "center", color: t.textMuted }}>Loading tickets...</div>
                ) : tickets.length === 0 ? (
                    <div style={{ padding: "56px 24px", textAlign: "center" }}>
                        <div style={{ width: 64, height: 64, borderRadius: 16, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                            <MessageSquare style={{ width: 28, height: 28, color: t.accentPrimary }} />
                        </div>
                        <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "1rem", marginBottom: 6 }}>No tickets yet</p>
                        <p style={{ color: t.textMuted, fontSize: "0.875rem", maxWidth: 380, margin: "0 auto" }}>
                            When you submit a support request, it will appear here with real-time status updates.
                        </p>
                    </div>
                ) : (
                    <div>
                        {/* Table header */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 140px 30px", gap: 12, padding: "10px 24px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                            {["Subject", "Priority", "Status", "Updated", ""].map(h => (
                                <span key={h} style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                            ))}
                        </div>
                        {tickets.map(ticket => {
                            const sm = STATUS_META[ticket.status] ?? STATUS_META.open;
                            const pm = PRIORITY_META[ticket.priority] ?? PRIORITY_META.medium;
                            return (
                                <div key={ticket.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 140px 30px", gap: 12, padding: "14px 24px", borderBottom: `1px solid ${t.borderSecondary}`, alignItems: "center", cursor: "pointer", transition: "background 0.1s" }}
                                    onMouseEnter={e => (e.currentTarget.style.background = t.bgCardHover)}
                                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                    <div>
                                        <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>{ticket.subject}</p>
                                        <p style={{ fontSize: "0.75rem", color: t.textMuted, fontFamily: t.fontMono }}>#{ticket.id.slice(0, 8)}</p>
                                    </div>
                                    <span style={{ fontSize: "0.78rem", fontWeight: 600, color: pm.color }}>{pm.label}</span>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: sm.bg, color: sm.color, fontSize: "0.72rem", fontWeight: 700, width: "fit-content" }}>
                                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: sm.color }} /> {sm.label}
                                    </span>
                                    <span style={{ fontSize: "0.78rem", color: t.textMuted }}>{new Date(ticket.updatedAt).toLocaleDateString()}</span>
                                    <ChevronRight style={{ width: 14, height: 14, color: t.textMuted }} />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
