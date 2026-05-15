"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { ArrowLeft, Plus, HelpCircle, Trash2, Eye, EyeOff, Save, X } from "lucide-react";

interface FaqEntry {
    id: string;
    question: string;
    answer: string;
    category: string;
    sortOrder: number;
    published: boolean;
    createdAt: string;
}

export default function FaqBuilder() {
    const t = useThemeTokens();
    const [entries, setEntries] = useState<FaqEntry[]>([]);
    const [loading, setLoading] = useState(true);

    // New entry form
    const [showNew, setShowNew] = useState(false);
    const [newQ, setNewQ] = useState("");
    const [newA, setNewA] = useState("");
    const [newCat, setNewCat] = useState("General");
    const [newOrder, setNewOrder] = useState(0);
    const [newPublished, setNewPublished] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit state
    const [editId, setEditId] = useState<string | null>(null);
    const [editQ, setEditQ] = useState("");
    const [editA, setEditA] = useState("");
    const [editCat, setEditCat] = useState("");
    const [editOrder, setEditOrder] = useState(0);

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };

    const inputStyle: React.CSSProperties = {
        width: "100%", boxSizing: "border-box" as const,
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.isMono ? 4 : 8, color: t.textPrimary,
        fontSize: "0.88rem", padding: "10px 14px", outline: "none",
    };

    const labelStyle: React.CSSProperties = {
        display: "block", fontSize: "0.72rem", fontWeight: 700,
        color: t.textMuted, textTransform: "uppercase" as const,
        letterSpacing: "0.06em", marginBottom: 4,
    };

    const fetchEntries = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/cms/faq");
            const data = await res.json();
            setEntries(data.entries ?? []);
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchEntries(); }, [fetchEntries]);

    const handleCreate = async () => {
        if (!newQ.trim() || !newA.trim()) return;
        setSaving(true);
        try {
            const res = await fetch("/api/cms/faq", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: newQ.trim(), answer: newA.trim(),
                    category: newCat.trim() || "General",
                    sortOrder: newOrder, published: newPublished,
                }),
            });
            if (res.ok) {
                setNewQ(""); setNewA(""); setNewCat("General"); setNewOrder(0); setNewPublished(false);
                setShowNew(false);
                fetchEntries();
            }
        } catch { /* silent */ } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async (id: string) => {
        setSaving(true);
        try {
            await fetch(`/api/cms/faq/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: editQ.trim(), answer: editA.trim(),
                    category: editCat.trim(), sortOrder: editOrder,
                }),
            });
            setEditId(null);
            fetchEntries();
        } catch { /* silent */ } finally {
            setSaving(false);
        }
    };

    const handleTogglePublish = async (id: string, current: boolean) => {
        try {
            await fetch(`/api/cms/faq/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ published: !current }),
            });
            setEntries(prev => prev.map(e => e.id === id ? { ...e, published: !current } : e));
        } catch { /* silent */ }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this FAQ entry?")) return;
        try {
            await fetch(`/api/cms/faq/${id}`, { method: "DELETE" });
            setEntries(prev => prev.filter(e => e.id !== id));
        } catch { /* silent */ }
    };

    const startEdit = (e: FaqEntry) => {
        setEditId(e.id);
        setEditQ(e.question);
        setEditA(e.answer);
        setEditCat(e.category);
        setEditOrder(e.sortOrder);
    };

    // Group by category
    const grouped: Record<string, FaqEntry[]> = {};
    for (const e of entries) {
        if (!grouped[e.category]) grouped[e.category] = [];
        grouped[e.category].push(e);
    }

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Back + Header */}
            <Link href="/adminsystemnrsp/cms" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                color: t.textMuted, fontSize: "0.82rem", textDecoration: "none", marginBottom: 20,
            }}>
                <ArrowLeft style={{ width: 14, height: 14 }} /> Back to CMS
            </Link>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <HelpCircle style={{ width: 22, height: 22, color: t.statusWarning }} />
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>FAQ Builder</h1>
                    {entries.length > 0 && (
                        <span style={{
                            padding: "2px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700,
                            background: t.statusWarningBg, color: t.statusWarning,
                        }}>{entries.length}</span>
                    )}
                </div>
                <button onClick={() => setShowNew(!showNew)} style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "10px 20px", borderRadius: t.buttonRadius,
                    background: t.statusWarning, color: "#000", border: "none",
                    fontWeight: 700, fontSize: "0.875rem", cursor: "pointer",
                }}>
                    <Plus style={{ width: 14, height: 14 }} />
                    New FAQ Entry
                </button>
            </div>

            {/* New entry form */}
            {showNew && (
                <div style={{ ...card, padding: 24, marginBottom: 24 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                        <div>
                            <label style={labelStyle}>Question</label>
                            <input value={newQ} onChange={e => setNewQ(e.target.value)} placeholder="How do I...?" style={inputStyle} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 }}>
                            <div>
                                <label style={labelStyle}>Category</label>
                                <input value={newCat} onChange={e => setNewCat(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Order</label>
                                <input type="number" value={newOrder} onChange={e => setNewOrder(parseInt(e.target.value) || 0)} style={inputStyle} />
                            </div>
                        </div>
                    </div>
                    <label style={labelStyle}>Answer (Markdown)</label>
                    <textarea value={newA} onChange={e => setNewA(e.target.value)} rows={4} placeholder="Write the answer..."
                        style={{ ...inputStyle, resize: "vertical" as const, fontFamily: t.fontMono, marginBottom: 16 }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <button onClick={handleCreate} disabled={saving || !newQ.trim() || !newA.trim()} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "8px 18px", borderRadius: t.buttonRadius, border: "none",
                            background: t.statusWarning, color: "#000", fontWeight: 700,
                            fontSize: "0.85rem", cursor: saving ? "not-allowed" : "pointer",
                            opacity: saving || !newQ.trim() || !newA.trim() ? 0.5 : 1,
                        }}>
                            <Plus style={{ width: 13, height: 13 }} />
                            {saving ? "Saving..." : "Add Entry"}
                        </button>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: t.textSecondary, cursor: "pointer" }}>
                            <input type="checkbox" checked={newPublished} onChange={e => setNewPublished(e.target.checked)} />
                            Publish immediately
                        </label>
                        <button onClick={() => setShowNew(false)} style={{
                            marginLeft: "auto", padding: "8px 14px", borderRadius: t.buttonRadius,
                            border: `1px solid ${t.borderPrimary}`, background: "transparent",
                            color: t.textMuted, cursor: "pointer", fontSize: "0.82rem",
                        }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* FAQ List grouped by category */}
            {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>Loading FAQs...</div>
            ) : entries.length === 0 ? (
                <div style={{ ...card, padding: "60px 40px", textAlign: "center" }}>
                    <HelpCircle style={{ width: 40, height: 40, color: t.borderSecondary, margin: "0 auto 16px" }} />
                    <p style={{ color: t.textMuted }}>No FAQ entries yet. Click "New FAQ Entry" to get started.</p>
                </div>
            ) : (
                Object.entries(grouped).map(([category, items]) => (
                    <div key={category} style={{ marginBottom: 28 }}>
                        <h3 style={{
                            fontSize: "0.78rem", fontWeight: 700, color: t.textMuted,
                            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10,
                        }}>
                            {category} ({items.length})
                        </h3>
                        <div style={{ ...card, overflow: "hidden" }}>
                            {items.map((entry, idx) => (
                                <div key={entry.id} style={{
                                    padding: "16px 20px",
                                    borderBottom: idx < items.length - 1 ? `1px solid ${t.borderSecondary}` : "none",
                                }}>
                                    {editId === entry.id ? (
                                        /* Edit mode */
                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                            <input value={editQ} onChange={e => setEditQ(e.target.value)} style={inputStyle} />
                                            <textarea value={editA} onChange={e => setEditA(e.target.value)} rows={3}
                                                style={{ ...inputStyle, resize: "vertical" as const, fontFamily: t.fontMono }}
                                            />
                                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                                <input value={editCat} onChange={e => setEditCat(e.target.value)} placeholder="Category" style={{ ...inputStyle, width: 160 }} />
                                                <input type="number" value={editOrder} onChange={e => setEditOrder(parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: 80 }} />
                                                <button onClick={() => handleUpdate(entry.id)} disabled={saving} style={{
                                                    display: "flex", alignItems: "center", gap: 6,
                                                    padding: "7px 16px", borderRadius: t.buttonRadius, border: "none",
                                                    background: t.statusWarning, color: "#000", fontWeight: 700,
                                                    fontSize: "0.82rem", cursor: "pointer",
                                                }}>
                                                    <Save style={{ width: 12, height: 12 }} /> Save
                                                </button>
                                                <button onClick={() => setEditId(null)} style={{
                                                    padding: "7px 14px", borderRadius: t.buttonRadius,
                                                    border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                                    color: t.textMuted, cursor: "pointer", fontSize: "0.82rem",
                                                }}>
                                                    <X style={{ width: 12, height: 12 }} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* View mode */
                                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                                            <div style={{ flex: 1 }}>
                                                <p style={{ fontWeight: 700, fontSize: "0.9rem", color: t.textPrimary, marginBottom: 4 }}>
                                                    {entry.question}
                                                </p>
                                                <p style={{ fontSize: "0.82rem", color: t.textSecondary, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                                                    {entry.answer.length > 200 ? entry.answer.substring(0, 200) + "..." : entry.answer}
                                                </p>
                                                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                                                    <span style={{ fontSize: "0.68rem", color: t.textMuted, fontFamily: t.fontMono }}>#{entry.sortOrder}</span>
                                                    <span style={{
                                                        fontSize: "0.68rem", fontWeight: 700, padding: "1px 8px", borderRadius: 8,
                                                        background: entry.published ? t.statusSuccessBg : `${t.textMuted}1a`,
                                                        color: entry.published ? t.statusSuccess : t.textMuted,
                                                    }}>
                                                        {entry.published ? "Published" : "Draft"}
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                                <button onClick={() => startEdit(entry)} title="Edit" style={{
                                                    width: 30, height: 30, borderRadius: t.isMono ? 4 : 7,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                                    color: t.textSecondary, cursor: "pointer",
                                                }}>
                                                    <Save style={{ width: 12, height: 12 }} />
                                                </button>
                                                <button onClick={() => handleTogglePublish(entry.id, entry.published)} title={entry.published ? "Unpublish" : "Publish"} style={{
                                                    width: 30, height: 30, borderRadius: t.isMono ? 4 : 7,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                                    color: entry.published ? t.statusSuccess : t.textMuted, cursor: "pointer",
                                                }}>
                                                    {entry.published ? <Eye style={{ width: 12, height: 12 }} /> : <EyeOff style={{ width: 12, height: 12 }} />}
                                                </button>
                                                <button onClick={() => handleDelete(entry.id)} title="Delete" style={{
                                                    width: 30, height: 30, borderRadius: t.isMono ? 4 : 7,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                                    color: t.statusError, cursor: "pointer",
                                                }}>
                                                    <Trash2 style={{ width: 12, height: 12 }} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
