"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    ArrowLeft, Plus, BookMarked, Trash2, Eye, EyeOff,
    Pencil, ChevronRight, Save, X, GripVertical
} from "lucide-react";

interface SectionNode {
    id: string;
    title: string;
    slug: string;
    sortOrder: number;
    published: boolean;
    children: SectionNode[];
}

interface Chapter {
    id: string;
    title: string;
    slug: string;
    icon: string | null;
    sortOrder: number;
    published: boolean;
    sections: SectionNode[];
}

export default function ManualDashboard() {
    const t = useThemeTokens();
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

    // New chapter form
    const [showNew, setShowNew] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newIcon, setNewIcon] = useState("");
    const [saving, setSaving] = useState(false);

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

    const fetchChapters = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/cms/manual/chapters");
            const data = await res.json();
            setChapters(data.chapters ?? []);
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchChapters(); }, [fetchChapters]);

    const handleCreateChapter = async () => {
        if (!newTitle.trim()) return;
        setSaving(true);
        try {
            const res = await fetch("/api/cms/manual/chapters", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: newTitle.trim(),
                    icon: newIcon.trim() || null,
                }),
            });
            if (res.ok) {
                setNewTitle(""); setNewIcon(""); setShowNew(false);
                fetchChapters();
            }
        } catch { /* silent */ } finally {
            setSaving(false);
        }
    };

    const handleTogglePublish = async (id: string, current: boolean) => {
        try {
            await fetch(`/api/cms/manual/chapters/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ published: !current }),
            });
            setChapters(prev => prev.map(c => c.id === id ? { ...c, published: !current } : c));
        } catch { /* silent */ }
    };

    const handleDeleteChapter = async (id: string) => {
        if (!confirm("Delete this chapter and ALL its sections permanently?")) return;
        try {
            await fetch(`/api/cms/manual/chapters/${id}`, { method: "DELETE" });
            setChapters(prev => prev.filter(c => c.id !== id));
        } catch { /* silent */ }
    };

    const countSections = (sections: SectionNode[]): number => {
        let count = sections.length;
        for (const s of sections) count += countSections(s.children);
        return count;
    };

    const renderSectionTree = (sections: SectionNode[], depth: number = 0): React.ReactNode => {
        if (!sections.length) return null;
        return sections.map(section => (
            <div key={section.id}>
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 16px", paddingLeft: 16 + depth * 20,
                    borderBottom: `1px solid ${t.borderSecondary}`,
                    fontSize: "0.82rem",
                }}>
                    <GripVertical style={{ width: 12, height: 12, color: t.textMuted, flexShrink: 0 }} />
                    {section.children.length > 0 && (
                        <ChevronRight style={{ width: 12, height: 12, color: t.textMuted }} />
                    )}
                    <span style={{ flex: 1, color: t.textPrimary, fontWeight: 600 }}>{section.title}</span>
                    <span style={{
                        fontSize: "0.68rem", fontWeight: 700, padding: "1px 8px", borderRadius: 8,
                        background: section.published ? t.statusSuccessBg : `${t.textMuted}1a`,
                        color: section.published ? t.statusSuccess : t.textMuted,
                    }}>
                        {section.published ? "Live" : "Draft"}
                    </span>
                    <span style={{ fontSize: "0.68rem", color: t.textMuted, fontFamily: t.fontMono }}>/{section.slug}</span>
                </div>
                {section.children.length > 0 && renderSectionTree(section.children, depth + 1)}
            </div>
        ));
    };

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
                    <BookMarked style={{ width: 22, height: 22, color: t.statusWarning }} />
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>User Manual</h1>
                    {chapters.length > 0 && (
                        <span style={{
                            padding: "2px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700,
                            background: t.statusWarningBg, color: t.statusWarning,
                        }}>{chapters.length} chapters</span>
                    )}
                </div>
                <button onClick={() => setShowNew(!showNew)} style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "10px 20px", borderRadius: t.buttonRadius,
                    background: t.statusWarning, color: "#000", border: "none",
                    fontWeight: 700, fontSize: "0.875rem", cursor: "pointer",
                }}>
                    <Plus style={{ width: 14, height: 14 }} />
                    New Chapter
                </button>
            </div>

            {/* New chapter form */}
            {showNew && (
                <div style={{ ...card, padding: 24, marginBottom: 24 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 16, marginBottom: 16 }}>
                        <div>
                            <label style={labelStyle}>Chapter Title</label>
                            <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                                placeholder="e.g. Compute Engine" style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Icon (Lucide name)</label>
                            <input value={newIcon} onChange={e => setNewIcon(e.target.value)}
                                placeholder="e.g. Server" style={inputStyle} />
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={handleCreateChapter} disabled={saving || !newTitle.trim()} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "8px 18px", borderRadius: t.buttonRadius, border: "none",
                            background: t.statusWarning, color: "#000", fontWeight: 700,
                            fontSize: "0.85rem", cursor: saving ? "not-allowed" : "pointer",
                            opacity: saving || !newTitle.trim() ? 0.5 : 1,
                        }}>
                            <Save style={{ width: 13, height: 13 }} />
                            {saving ? "Creating..." : "Create Chapter"}
                        </button>
                        <button onClick={() => setShowNew(false)} style={{
                            padding: "8px 14px", borderRadius: t.buttonRadius,
                            border: `1px solid ${t.borderPrimary}`, background: "transparent",
                            color: t.textMuted, cursor: "pointer", fontSize: "0.82rem",
                        }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Chapter List */}
            {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>Loading manual...</div>
            ) : chapters.length === 0 ? (
                <div style={{ ...card, padding: "60px 40px", textAlign: "center" }}>
                    <BookMarked style={{ width: 40, height: 40, color: t.borderSecondary, margin: "0 auto 16px" }} />
                    <p style={{ color: t.textMuted, marginBottom: 8 }}>No chapters yet</p>
                    <p style={{ color: t.textMuted, fontSize: "0.82rem" }}>
                        Create your first chapter to start building the user manual.
                    </p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {chapters.map(ch => {
                        const isExpanded = expandedChapter === ch.id;
                        const sectionCount = countSections(ch.sections);
                        return (
                            <div key={ch.id} style={{ ...card, overflow: "hidden" }}>
                                {/* Chapter header */}
                                <div style={{
                                    display: "flex", alignItems: "center", gap: 12, padding: "16px 20px",
                                    borderBottom: isExpanded ? `1px solid ${t.borderSecondary}` : "none",
                                }}>
                                    <button onClick={() => setExpandedChapter(isExpanded ? null : ch.id)} style={{
                                        background: "none", border: "none", cursor: "pointer", padding: 0,
                                        display: "flex", alignItems: "center", color: t.textMuted,
                                        transition: "transform 0.2s",
                                        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                    }}>
                                        <ChevronRight style={{ width: 16, height: 16 }} />
                                    </button>

                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: t.textPrimary }}>
                                                {ch.title}
                                            </span>
                                            <span style={{
                                                fontSize: "0.68rem", fontWeight: 700, padding: "1px 8px", borderRadius: 8,
                                                background: ch.published ? t.statusSuccessBg : `${t.textMuted}1a`,
                                                color: ch.published ? t.statusSuccess : t.textMuted,
                                            }}>
                                                {ch.published ? "Published" : "Draft"}
                                            </span>
                                        </div>
                                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                            <span style={{ fontSize: "0.72rem", color: t.textMuted, fontFamily: t.fontMono }}>/{ch.slug}</span>
                                            <span style={{ fontSize: "0.72rem", color: t.textMuted }}>
                                                {sectionCount} section{sectionCount !== 1 ? "s" : ""}
                                            </span>
                                            {ch.icon && (
                                                <span style={{ fontSize: "0.72rem", color: t.textMuted }}>
                                                    icon: {ch.icon}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: "flex", gap: 6 }}>
                                        <Link href={`/adminsystemnrsp/cms/manual/${ch.id}`} title="Edit sections" style={{
                                            width: 32, height: 32, borderRadius: t.isMono ? 4 : 7,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            border: `1px solid ${t.borderPrimary}`, color: t.statusWarning,
                                            textDecoration: "none",
                                        }}>
                                            <Pencil style={{ width: 13, height: 13 }} />
                                        </Link>
                                        <button onClick={() => handleTogglePublish(ch.id, ch.published)}
                                            title={ch.published ? "Unpublish" : "Publish"} style={{
                                            width: 32, height: 32, borderRadius: t.isMono ? 4 : 7,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                            color: ch.published ? t.statusSuccess : t.textMuted, cursor: "pointer",
                                        }}>
                                            {ch.published ? <Eye style={{ width: 13, height: 13 }} /> : <EyeOff style={{ width: 13, height: 13 }} />}
                                        </button>
                                        <button onClick={() => handleDeleteChapter(ch.id)} title="Delete" style={{
                                            width: 32, height: 32, borderRadius: t.isMono ? 4 : 7,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                            color: t.statusError, cursor: "pointer",
                                        }}>
                                            <Trash2 style={{ width: 13, height: 13 }} />
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded section tree */}
                                {isExpanded && (
                                    <div style={{ background: t.bgSecondary }}>
                                        {ch.sections.length === 0 ? (
                                            <div style={{ padding: "20px 16px", textAlign: "center", fontSize: "0.82rem", color: t.textMuted }}>
                                                No sections yet.{" "}
                                                <Link href={`/adminsystemnrsp/cms/manual/${ch.id}`} style={{ color: t.statusWarning, textDecoration: "none", fontWeight: 600 }}>
                                                    Add sections
                                                </Link>
                                            </div>
                                        ) : (
                                            renderSectionTree(ch.sections)
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
