"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    ArrowLeft, Plus, Save, Trash2, Eye, EyeOff,
    ChevronRight, ChevronDown, Code, AlertTriangle, Info, ShieldAlert,
    Bold, Italic, Link2, ImageIcon, X
} from "lucide-react";

interface SectionNode {
    id: string;
    chapterId: string;
    parentId: string | null;
    title: string;
    slug: string;
    content?: string;
    sortOrder: number;
    published: boolean;
    children: SectionNode[];
}

interface Chapter {
    id: string;
    title: string;
    slug: string;
    icon: string | null;
    published: boolean;
    sections: SectionNode[];
}

export default function ChapterEditor() {
    const t = useThemeTokens();
    const params = useParams<{ chapterId: string }>();
    const chapterId = params?.chapterId;

    const [chapter, setChapter] = useState<Chapter | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Section editor state
    const [editTitle, setEditTitle] = useState("");
    const [editSlug, setEditSlug] = useState("");
    const [editContent, setEditContent] = useState("");
    const [editParentId, setEditParentId] = useState<string | null>(null);
    const [editPublished, setEditPublished] = useState(false);
    const [editSortOrder, setEditSortOrder] = useState(0);
    const [saving, setSaving] = useState(false);
    const [sectionLoading, setSectionLoading] = useState(false);

    // New section form
    const [showNewSection, setShowNewSection] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newParentId, setNewParentId] = useState<string | null>(null);

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };

    const inputStyle: React.CSSProperties = {
        width: "100%", boxSizing: "border-box" as const,
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.isMono ? 0 : 8, color: t.textPrimary,
        fontSize: "0.88rem", padding: "10px 14px", outline: "none",
    };

    const labelStyle: React.CSSProperties = {
        display: "block", fontSize: "0.72rem", fontWeight: 700,
        color: t.textMuted, textTransform: "uppercase" as const,
        letterSpacing: "0.06em", marginBottom: 4,
    };

    const fetchChapter = useCallback(async () => {
        try {
            const res = await fetch(`/api/cms/manual/chapters/${chapterId}`);
            const data = await res.json();
            if (data.chapter) setChapter(data.chapter);
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, [chapterId]);

    useEffect(() => { fetchChapter(); }, [fetchChapter]);

    // Load section content on select
    const selectSection = async (id: string) => {
        setSelectedId(id);
        setSectionLoading(true);
        try {
            const res = await fetch(`/api/cms/manual/sections/${id}`);
            const data = await res.json();
            if (data.section) {
                setEditTitle(data.section.title);
                setEditSlug(data.section.slug);
                setEditContent(data.section.content || "");
                setEditParentId(data.section.parentId || null);
                setEditPublished(data.section.published);
                setEditSortOrder(data.section.sortOrder);
            }
        } catch { /* silent */ } finally {
            setSectionLoading(false);
        }
    };

    const handleSaveSection = async () => {
        if (!selectedId) return;
        setSaving(true);
        try {
            await fetch(`/api/cms/manual/sections/${selectedId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: editTitle.trim(),
                    slug: editSlug.trim(),
                    content: editContent,
                    parentId: editParentId,
                    sortOrder: editSortOrder,
                    published: editPublished,
                }),
            });
            fetchChapter();
        } catch { /* silent */ } finally {
            setSaving(false);
        }
    };

    const handleCreateSection = async () => {
        if (!newTitle.trim()) return;
        setSaving(true);
        try {
            const res = await fetch("/api/cms/manual/sections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chapterId,
                    parentId: newParentId,
                    title: newTitle.trim(),
                }),
            });
            if (res.ok) {
                setNewTitle(""); setNewParentId(null); setShowNewSection(false);
                fetchChapter();
            }
        } catch { /* silent */ } finally {
            setSaving(false);
        }
    };

    const handleDeleteSection = async (id: string) => {
        if (!confirm("Delete this section and all sub-sections?")) return;
        try {
            await fetch(`/api/cms/manual/sections/${id}`, { method: "DELETE" });
            if (selectedId === id) setSelectedId(null);
            fetchChapter();
        } catch { /* silent */ }
    };

    const toggleExpanded = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // Flatten all sections for parent dropdown
    const flattenSections = (sections: SectionNode[], depth = 0): Array<{ id: string; title: string; depth: number }> => {
        const result: Array<{ id: string; title: string; depth: number }> = [];
        for (const s of sections) {
            result.push({ id: s.id, title: s.title, depth });
            result.push(...flattenSections(s.children, depth + 1));
        }
        return result;
    };

    // Insert markdown syntax at cursor
    const insertMarkdown = (prefix: string, suffix: string = "") => {
        const textarea = document.getElementById("manual-content") as HTMLTextAreaElement;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = editContent.substring(start, end);
        const replacement = prefix + (selected || "text") + suffix;
        setEditContent(editContent.substring(0, start) + replacement + editContent.substring(end));
        setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = start + prefix.length;
            textarea.selectionEnd = start + prefix.length + (selected || "text").length;
        }, 10);
    };

    // Render section tree recursively
    const renderTree = (sections: SectionNode[], depth: number = 0): React.ReactNode => {
        return sections.map(section => {
            const isSelected = selectedId === section.id;
            const isExpanded = expandedIds.has(section.id);
            const hasChildren = section.children.length > 0;

            return (
                <div key={section.id}>
                    <div
                        onClick={() => selectSection(section.id)}
                        style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "8px 12px", paddingLeft: 12 + depth * 16,
                            cursor: "pointer", transition: "all 0.12s",
                            background: isSelected ? t.statusWarningBg : "transparent",
                            borderLeft: `3px solid ${isSelected ? t.statusWarning : "transparent"}`,
                            borderBottom: `1px solid ${t.borderSecondary}`,
                        }}
                    >
                        {hasChildren ? (
                            <button onClick={e => { e.stopPropagation(); toggleExpanded(section.id); }} style={{
                                background: "none", border: "none", padding: 0, cursor: "pointer",
                                color: t.textMuted, display: "flex",
                            }}>
                                {isExpanded
                                    ? <ChevronDown style={{ width: 12, height: 12 }} />
                                    : <ChevronRight style={{ width: 12, height: 12 }} />
                                }
                            </button>
                        ) : (
                            <span style={{ width: 12 }} />
                        )}
                        <span style={{
                            flex: 1, fontSize: "0.82rem", fontWeight: isSelected ? 700 : 500,
                            color: isSelected ? t.statusWarning : t.textPrimary,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                            {section.title}
                        </span>
                        {!section.published && (
                            <EyeOff style={{ width: 10, height: 10, color: t.textMuted, flexShrink: 0 }} />
                        )}
                    </div>
                    {hasChildren && isExpanded && renderTree(section.children, depth + 1)}
                </div>
            );
        });
    };

    if (loading) {
        return (
            <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: t.bgPrimary }}>
                <p style={{ color: t.textMuted }}>Loading chapter...</p>
            </div>
        );
    }

    if (!chapter) {
        return (
            <div style={{ padding: "32px 36px", backgroundColor: t.bgPrimary, minHeight: "100vh" }}>
                <p style={{ color: t.statusError }}>Chapter not found.</p>
                <Link href="/adminsystemnrsp/cms/manual" style={{ color: t.textMuted, textDecoration: "none" }}>
                    <ArrowLeft style={{ width: 14, height: 14 }} /> Back to Manual
                </Link>
            </div>
        );
    }

    const flatSections = flattenSections(chapter.sections);

    return (
        <div style={{ display: "flex", height: "100vh", backgroundColor: t.bgPrimary, overflow: "hidden" }}>
            {/* Left — Section Tree */}
            <div style={{
                width: 280, minWidth: 280, height: "100vh", overflowY: "auto",
                borderRight: `1px solid ${t.borderPrimary}`,
                background: t.isMono ? (t.isLight ? "#fafafa" : "#000000") : t.bgSecondary,
                display: "flex", flexDirection: "column",
            }}>
                {/* Chapter header */}
                <div style={{ padding: "14px 12px", borderBottom: `1px solid ${t.borderPrimary}` }}>
                    <Link href="/adminsystemnrsp/cms/manual" style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        color: t.textMuted, fontSize: "0.72rem", textDecoration: "none",
                        marginBottom: 8,
                    }}>
                        <ArrowLeft style={{ width: 10, height: 10 }} /> Manual
                    </Link>
                    <h2 style={{ fontSize: "0.92rem", fontWeight: 800, color: t.textPrimary, marginBottom: 2 }}>
                        {chapter.title}
                    </h2>
                    <span style={{ fontSize: "0.68rem", color: t.textMuted, fontFamily: t.fontMono }}>/{chapter.slug}</span>
                </div>

                {/* Section tree */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                    {chapter.sections.length === 0 ? (
                        <p style={{ padding: 16, fontSize: "0.82rem", color: t.textMuted, textAlign: "center" }}>
                            No sections yet
                        </p>
                    ) : (
                        renderTree(chapter.sections)
                    )}
                </div>

                {/* Add section button */}
                <div style={{ padding: 10, borderTop: `1px solid ${t.borderPrimary}` }}>
                    {showNewSection ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                                placeholder="Section title" style={{ ...inputStyle, fontSize: "0.82rem", padding: "7px 10px" }} />
                            <select value={newParentId || ""} onChange={e => setNewParentId(e.target.value || null)}
                                style={{ ...inputStyle, fontSize: "0.78rem", padding: "6px 10px", cursor: "pointer" }}>
                                <option value="">Top level</option>
                                {flatSections.map(s => (
                                    <option key={s.id} value={s.id}>{"  ".repeat(s.depth) + s.title}</option>
                                ))}
                            </select>
                            <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={handleCreateSection} disabled={!newTitle.trim() || saving} style={{
                                    flex: 1, padding: "6px", borderRadius: t.isMono ? 0 : 6, border: "none",
                                    background: t.statusWarning, color: "#000", fontWeight: 700,
                                    fontSize: "0.78rem", cursor: "pointer", opacity: !newTitle.trim() ? 0.5 : 1,
                                }}>
                                    Add
                                </button>
                                <button onClick={() => { setShowNewSection(false); setNewTitle(""); }} style={{
                                    padding: "6px 10px", borderRadius: t.isMono ? 0 : 6,
                                    border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                    color: t.textMuted, cursor: "pointer", fontSize: "0.78rem",
                                }}>
                                    <X style={{ width: 10, height: 10 }} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setShowNewSection(true)} style={{
                            width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                            gap: 6, padding: "8px", borderRadius: t.isMono ? 0 : 6,
                            border: `1px dashed ${t.borderPrimary}`, background: "transparent",
                            color: t.textMuted, cursor: "pointer", fontSize: "0.78rem",
                        }}>
                            <Plus style={{ width: 12, height: 12 }} /> Add Section
                        </button>
                    )}
                </div>
            </div>

            {/* Right — Section Editor */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
                {!selectedId ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: t.textMuted }}>
                        <p style={{ fontSize: "0.9rem" }}>Select a section from the tree to edit its content.</p>
                    </div>
                ) : sectionLoading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: t.textMuted }}>
                        <p>Loading section...</p>
                    </div>
                ) : (
                    <div style={{ maxWidth: 840 }}>
                        {/* Meta row */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 16, marginBottom: 20 }}>
                            <div>
                                <label style={labelStyle}>Title</label>
                                <input id="manual-title" value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Slug</label>
                                <input id="manual-slug" value={editSlug} onChange={e => setEditSlug(e.target.value)}
                                    style={{ ...inputStyle, fontFamily: t.fontMono, fontSize: "0.82rem" }} />
                            </div>
                            <div>
                                <label style={labelStyle}>Order</label>
                                <input id="manual-order" type="number" value={editSortOrder} onChange={e => setEditSortOrder(parseInt(e.target.value) || 0)} style={inputStyle} />
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginBottom: 20 }}>
                            <div>
                                <label style={labelStyle}>Parent Section</label>
                                <select value={editParentId || ""} onChange={e => setEditParentId(e.target.value || null)}
                                    style={{ ...inputStyle, cursor: "pointer" }}>
                                    <option value="">Top level (no parent)</option>
                                    {flatSections.filter(s => s.id !== selectedId).map(s => (
                                        <option key={s.id} value={s.id}>{"  ".repeat(s.depth) + s.title}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: t.textSecondary }}>
                                    {editPublished ? "Published" : "Draft"}
                                </span>
                                <button id="manual-publish-toggle" onClick={() => setEditPublished(!editPublished)} style={{
                                    width: 44, height: 24, borderRadius: 12, border: "none",
                                    cursor: "pointer", position: "relative", transition: "background 0.25s",
                                    background: editPublished ? t.statusSuccess : `${t.textMuted}33`,
                                }}>
                                    <span style={{
                                        position: "absolute", top: 3,
                                        left: editPublished ? 22 : 3,
                                        width: 18, height: 18, borderRadius: "50%",
                                        background: "#fff", transition: "left 0.25s",
                                    }} />
                                </button>
                            </div>
                        </div>

                        {/* Markdown Toolbar */}
                        <div style={{
                            display: "flex", alignItems: "center", gap: 2, padding: "6px 8px",
                            borderRadius: `${t.isMono ? 0 : 8}px ${t.isMono ? 0 : 8}px 0 0`,
                            border: `1px solid ${t.borderPrimary}`, borderBottom: "none",
                            background: t.bgSecondary,
                        }}>
                            {[
                                { icon: Bold, action: () => insertMarkdown("**", "**"), title: "Bold" },
                                { icon: Italic, action: () => insertMarkdown("*", "*"), title: "Italic" },
                                { icon: Code, action: () => insertMarkdown("```\n", "\n```"), title: "Code Block" },
                                { icon: Link2, action: () => insertMarkdown("[", "](url)"), title: "Link" },
                                { icon: ImageIcon, action: () => insertMarkdown("![alt](", ")"), title: "Image" },
                            ].map(({ icon: Icon, action, title }) => (
                                <button key={title} onClick={action} title={title} style={{
                                    width: 30, height: 28, borderRadius: t.isMono ? 0 : 5,
                                    border: "none", background: "transparent",
                                    color: t.textSecondary, cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                    <Icon style={{ width: 14, height: 14 }} />
                                </button>
                            ))}
                            <div style={{ width: 1, height: 18, background: t.borderPrimary, margin: "0 4px" }} />
                            {[
                                { icon: Info, action: () => insertMarkdown("> [!NOTE]\n> ", ""), title: "Note Callout", color: t.accentPrimary },
                                { icon: AlertTriangle, action: () => insertMarkdown("> [!WARNING]\n> ", ""), title: "Warning Callout", color: t.statusWarning },
                                { icon: ShieldAlert, action: () => insertMarkdown("> [!CAUTION]\n> ", ""), title: "Caution Callout", color: t.statusError },
                            ].map(({ icon: Icon, action, title, color }) => (
                                <button key={title} onClick={action} title={title} style={{
                                    width: 30, height: 28, borderRadius: t.isMono ? 0 : 5,
                                    border: "none", background: "transparent",
                                    color, cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                    <Icon style={{ width: 14, height: 14 }} />
                                </button>
                            ))}
                        </div>

                        {/* Content textarea */}
                        <textarea
                            id="manual-content"
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            placeholder="Write section content in Markdown...&#10;&#10;Supports:&#10;- Code blocks (```)&#10;- Callouts: > [!NOTE], > [!WARNING], > [!CAUTION]&#10;- Images: ![alt](url)&#10;- Links: [text](url)"
                            style={{
                                ...inputStyle,
                                borderRadius: `0 0 ${t.isMono ? 0 : 8}px ${t.isMono ? 0 : 8}px`,
                                fontFamily: t.fontMono, fontSize: "0.86rem",
                                lineHeight: 1.7, minHeight: 400, resize: "vertical" as const,
                            }}
                        />

                        {/* Actions */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                            <button id="manual-save-btn" onClick={handleSaveSection} disabled={saving} style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "10px 24px", borderRadius: t.buttonRadius,
                                border: "none", cursor: saving ? "not-allowed" : "pointer",
                                background: t.statusWarning, color: "#000",
                                fontWeight: 700, fontSize: "0.875rem", opacity: saving ? 0.6 : 1,
                            }}>
                                <Save style={{ width: 14, height: 14 }} />
                                {saving ? "Saving..." : "Save Section"}
                            </button>
                            <button onClick={() => handleDeleteSection(selectedId)} style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "10px 18px", borderRadius: t.buttonRadius,
                                border: `1px solid ${t.statusError}33`, background: t.statusErrorBg,
                                color: t.statusError, cursor: "pointer",
                                fontWeight: 600, fontSize: "0.85rem",
                            }}>
                                <Trash2 style={{ width: 14, height: 14 }} /> Delete
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
