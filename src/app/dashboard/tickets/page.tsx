"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useIsMobile } from "@/lib/useIsMobile";
import {
    MessageSquare, Plus, Clock, CheckCircle2, AlertCircle, X,
    ChevronRight, Send, Upload, Image as ImageIcon, FileText, Loader2
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
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
    PENDING:  { label: "Pending",  color: "#fdd663", bg: "rgba(253,214,99,0.12)" },
    UNSOLVED: { label: "Unsolved", color: "#f28b82", bg: "rgba(242,139,130,0.12)" },
    SOLVED:   { label: "Solved",   color: "#81c995", bg: "rgba(129,201,149,0.12)" },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
    low:      { label: "Low",      color: "#81c995" },
    medium:   { label: "Medium",   color: "#8ab4f8" },
    high:     { label: "High",     color: "#fdd663" },
    critical: { label: "Critical", color: "#f28b82" },
};

export default function TicketsPage() {
    const t = useThemeTokens();
    const isMobile = useIsMobile();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState("medium");
    const [files, setFiles] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [filter, setFilter] = useState<string>("all");
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setFiles(Array.from(e.target.files).slice(0, 5));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) { setError("Title is required."); return; }
        setSubmitting(true); setError("");
        try {
            let imageUrls: string[] = [];
            // Upload images via centralized secure pipeline
            if (files.length > 0) {
                const fd = new FormData();
                files.forEach(f => fd.append("files", f));
                fd.append("context", "TICKET");
                const uploadRes = await fetch("/api/uploads", { method: "POST", body: fd });
                if (!uploadRes.ok) {
                    let errMsg = `Upload failed (HTTP ${uploadRes.status})`;
                    if (uploadRes.status === 413) {
                        errMsg = "File too large. Maximum total upload size is 18 MB per file.";
                    } else {
                        try {
                            const j = await uploadRes.json();
                            errMsg = j.error || errMsg;
                        } catch { /* response was not JSON */ }
                    }
                    throw new Error(errMsg);
                }
                const uploadData = await uploadRes.json();
                // Collect stored file names from successful uploads
                imageUrls = (uploadData.files ?? []).map((f: { storedName: string }) => f.storedName);
                // Show warnings for any per-file errors (e.g. duplicates)
                if (uploadData.errors?.length > 0) {
                    const warnings = (uploadData.errors as Array<{ fileName: string; error: string }>)
                        .map(e => `${e.fileName}: ${e.error}`).join("\n");
                    setError(warnings);
                }
                if (imageUrls.length === 0 && uploadData.errors?.length > 0) {
                    throw new Error("All files were rejected. " +
                        (uploadData.errors as Array<{ error: string }>)[0].error);
                }
            }
            // Create ticket
            const res = await fetch("/api/tickets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, description, priority, imageUrls: imageUrls.length ? imageUrls : undefined }),
            });
            if (!res.ok) { const j = await res.json(); throw new Error(j.error || "Failed."); }
            setSuccess("Ticket submitted successfully.");
            setTitle(""); setDescription(""); setFiles([]); setShowCreate(false);
            loadTickets();
        } catch (err) { setError(err instanceof Error ? err.message : "Failed."); }
        finally { setSubmitting(false); }
    };

    const filtered = filter === "all" ? tickets : tickets.filter(t => t.status === filter);

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const inputStyle: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, color: t.textPrimary, fontSize: "0.875rem", outline: "none", padding: "9px 13px", width: "100%", boxSizing: "border-box" as const, fontFamily: t.fontFamily };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>Dashboard &bull; Tickets</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <MessageSquare style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Support Tickets</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Submit and track support requests with markdown and image evidence.</p>
                        </div>
                    </div>
                    <button onClick={() => setShowCreate(!showCreate)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: "pointer" }}>
                        <Plus style={{ width: 14, height: 14 }} /> New Ticket
                    </button>
                </div>
            </div>

            {/* Toasts */}
            {success && <div style={{ padding: "12px 16px", borderRadius: t.buttonRadius, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 style={{ width: 14, height: 14 }} /> {success}</span><button onClick={() => setSuccess("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex" }}><X style={{ width: 14, height: 14 }} /></button></div>}
            {error && <div style={{ padding: "12px 16px", borderRadius: t.buttonRadius, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><AlertCircle style={{ width: 14, height: 14 }} /> {error}</span><button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex" }}><X style={{ width: 14, height: 14 }} /></button></div>}

            {/* Create Ticket Form */}
            {showCreate && (
                <form onSubmit={handleSubmit} style={{ ...card, padding: "24px 28px", marginBottom: 24 }}>
                    <h3 style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                        <Send style={{ width: 16, height: 16, color: t.accentPrimary }} /> Create New Ticket
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 180px", gap: 14 }}>
                            <div>
                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Title</label>
                                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief description of your issue" style={inputStyle} maxLength={200} />
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
                            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                                <FileText style={{ width: 11, height: 11, display: "inline", verticalAlign: "middle" }} /> Description (Markdown supported)
                            </label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your issue in detail. Markdown formatting is supported." rows={6} style={{ ...inputStyle, resize: "vertical" as const, fontFamily: t.fontMono, fontSize: "0.82rem" }} />
                        </div>
                        {/* Image Upload */}
                        <div>
                            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Evidence (up to 5 images)</label>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", borderRadius: t.cardRadius, border: `2px dashed ${t.borderPrimary}`, cursor: "pointer", color: t.textMuted, fontSize: "0.82rem", justifyContent: "center" }}>
                                <Upload style={{ width: 16, height: 16 }} />
                                {files.length ? `${files.length} file(s) selected` : "Click or drag to upload images"}
                                <input type="file" accept="image/*" multiple onChange={handleFileChange} style={{ display: "none" }} />
                            </label>
                            {files.length > 0 && (
                                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                                    {files.map((f, i) => (
                                        <span key={i} style={{ padding: "3px 8px", borderRadius: 4, background: t.bgTertiary, fontSize: "0.72rem", color: t.textSecondary, display: "flex", alignItems: "center", gap: 4 }}>
                                            <ImageIcon style={{ width: 10, height: 10 }} /> {f.name.slice(0, 20)}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button type="submit" disabled={submitting} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: t.buttonRadius, border: "none", background: submitting ? t.textMuted : t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: submitting ? "not-allowed" : "pointer" }}>
                                {submitting ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 14, height: 14 }} />}
                                {submitting ? "Submitting..." : "Submit Ticket"}
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* Filter Tabs */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {[{ key: "all", label: "All" }, { key: "PENDING", label: "Pending" }, { key: "UNSOLVED", label: "Unsolved" }, { key: "SOLVED", label: "Solved" }].map(tab => (
                    <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
                        padding: "6px 16px", borderRadius: t.buttonRadius, border: `1px solid ${filter === tab.key ? t.accentPrimary + "55" : t.borderPrimary}`,
                        background: filter === tab.key ? t.accentPrimaryMuted : "transparent",
                        color: filter === tab.key ? t.accentPrimary : t.textSecondary,
                        fontWeight: filter === tab.key ? 700 : 500, fontSize: "0.82rem", cursor: "pointer",
                    }}>{tab.label}</button>
                ))}
                <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: t.textMuted, alignSelf: "center" }}>{filtered.length} ticket{filtered.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Tickets List */}
            <div style={card}>
                {loading ? (
                    <div style={{ padding: 48, textAlign: "center", color: t.textMuted }}>Loading tickets...</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "56px 24px", textAlign: "center" }}>
                        <div style={{ width: 64, height: 64, borderRadius: 16, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                            <MessageSquare style={{ width: 28, height: 28, color: t.accentPrimary }} />
                        </div>
                        <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "1rem", marginBottom: 6 }}>No tickets found</p>
                        <p style={{ color: t.textMuted, fontSize: "0.875rem" }}>Submit a support request to get started.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 120px 30px", gap: 12, padding: "10px 24px", borderBottom: `1px solid ${t.borderSecondary}`, minWidth: 560 }}>
                            {["Title", "Priority", "Status", "Updated", ""].map(h => (
                                <span key={h} style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                            ))}
                        </div>
                        {filtered.map(ticket => {
                            const sm = STATUS_META[ticket.status] ?? STATUS_META.PENDING;
                            const pm = PRIORITY_META[ticket.priority] ?? PRIORITY_META.medium;
                            return (
                                <div key={ticket.id} onClick={() => setSelectedTicket(ticket)} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 120px 30px", gap: 12, padding: "14px 24px", borderBottom: `1px solid ${t.borderSecondary}`, alignItems: "center", cursor: "pointer", transition: "background 0.1s", minWidth: 560 }}
                                    onMouseEnter={e => (e.currentTarget.style.background = t.bgCardHover)}
                                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                    <div>
                                        <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>{ticket.title}</p>
                                        <p style={{ fontSize: "0.72rem", color: t.textMuted, fontFamily: t.fontMono }}>#{ticket.id.slice(0, 8)}</p>
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

            {/* Ticket Detail Modal */}
            {selectedTicket && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setSelectedTicket(null); }}>
                    <div style={{ ...card, width: "100%", maxWidth: 680, maxHeight: "85vh", overflowY: "auto", padding: 0 }}>
                        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <p style={{ fontSize: "0.72rem", color: t.textMuted, fontFamily: t.fontMono }}>#{selectedTicket.id.slice(0, 8)}</p>
                                <h2 style={{ fontWeight: 800, fontSize: "1.1rem", color: t.textPrimary }}>{selectedTicket.title}</h2>
                            </div>
                            <button onClick={() => setSelectedTicket(null)} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X style={{ width: 14, height: 14 }} /></button>
                        </div>
                        <div style={{ padding: 24 }}>
                            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                                {(() => { const sm = STATUS_META[selectedTicket.status] ?? STATUS_META.PENDING; return <span style={{ padding: "4px 12px", borderRadius: 6, background: sm.bg, color: sm.color, fontSize: "0.78rem", fontWeight: 700 }}>{sm.label}</span>; })()}
                                {(() => { const pm = PRIORITY_META[selectedTicket.priority] ?? PRIORITY_META.medium; return <span style={{ padding: "4px 12px", borderRadius: 6, background: t.bgTertiary, color: pm.color, fontSize: "0.78rem", fontWeight: 700 }}>{pm.label} priority</span>; })()}
                                <span style={{ padding: "4px 12px", borderRadius: 6, background: t.bgTertiary, color: t.textMuted, fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 4 }}>
                                    <Clock style={{ width: 11, height: 11 }} /> {new Date(selectedTicket.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                </span>
                            </div>
                            {selectedTicket.description && (
                                <div style={{ padding: "16px 20px", borderRadius: t.cardRadius, background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`, fontSize: "0.875rem", color: t.textSecondary, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: t.fontMono }}>
                                    {selectedTicket.description}
                                </div>
                            )}
                            {selectedTicket.imageUrls && (() => {
                                try {
                                    const imgs: string[] = JSON.parse(selectedTicket.imageUrls);
                                    return imgs.length > 0 ? (
                                        <div style={{ marginTop: 16 }}>
                                            <p style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", marginBottom: 8 }}>Evidence</p>
                                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                {imgs.map((img, i) => (
                                                    <img key={i} src={`/api/tickets/file/${img}`} alt={`Evidence ${i + 1}`} onClick={() => setLightboxUrl(`/api/tickets/file/${img}`)} style={{ maxWidth: 200, maxHeight: 150, borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, objectFit: "cover", cursor: "pointer", transition: "opacity 0.15s" }} onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")} onMouseLeave={e => (e.currentTarget.style.opacity = "1")} />
                                                ))}
                                            </div>
                                        </div>
                                    ) : null;
                                } catch { return null; }
                            })()}
                            {selectedTicket.resolvedAt && (
                                <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: t.cardRadius, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, display: "flex", alignItems: "center", gap: 8 }}>
                                    <CheckCircle2 style={{ width: 14, height: 14, color: t.statusSuccess }} />
                                    <span style={{ fontSize: "0.82rem", color: t.statusSuccess }}>Resolved on {new Date(selectedTicket.resolvedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox */}
            {lightboxUrl && (
                <div
                    onClick={() => setLightboxUrl(null)}
                    onKeyDown={e => { if (e.key === "Escape") setLightboxUrl(null); }}
                    tabIndex={0}
                    style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out", padding: 32 }}
                >
                    <img src={lightboxUrl} alt="Evidence fullscreen" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: t.cardRadius, boxShadow: "0 8px 48px rgba(0,0,0,0.6)" }} />
                </div>
            )}

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
