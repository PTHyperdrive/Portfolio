"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { ArrowLeft, Save, Eye } from "lucide-react";

export default function CmsNewPost() {
    const t = useThemeTokens();
    const router = useRouter();

    const [type, setType] = useState<string>("NEWS");
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [content, setContent] = useState("");
    const [coverImage, setCoverImage] = useState("");
    const [published, setPublished] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // Auto-generate slug from title
    const autoSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .substring(0, 120);

    const handleSave = async () => {
        setError("");
        if (!title.trim()) { setError("Title is required."); return; }
        if (!content.trim()) { setError("Content is required."); return; }

        setSaving(true);
        try {
            const res = await fetch("/api/cms/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type,
                    title: title.trim(),
                    slug: slug.trim() || autoSlug,
                    excerpt: excerpt.trim() || null,
                    content: content.trim(),
                    coverImage: coverImage.trim() || null,
                    published,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Failed to create post");
                return;
            }
            router.push("/adminsystemnrsp/cms");
        } catch {
            setError("Network error");
        } finally {
            setSaving(false);
        }
    };

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow, padding: "28px",
    };

    const inputStyle: React.CSSProperties = {
        width: "100%", boxSizing: "border-box" as const,
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.isMono ? 4 : 8, color: t.textPrimary,
        fontSize: "0.9rem", padding: "10px 14px", outline: "none",
    };

    const labelStyle: React.CSSProperties = {
        display: "block", fontSize: "0.78rem", fontWeight: 700,
        color: t.textMuted, textTransform: "uppercase" as const,
        letterSpacing: "0.06em", marginBottom: 6,
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Back + Header */}
            <Link href="/adminsystemnrsp/cms" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                color: t.textMuted, fontSize: "0.82rem", textDecoration: "none",
                marginBottom: 20,
            }}>
                <ArrowLeft style={{ width: 14, height: 14 }} /> Back to CMS
            </Link>

            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary, marginBottom: 28 }}>
                New Post
            </h1>

            {error && (
                <div style={{
                    padding: "12px 18px", borderRadius: t.isMono ? 4 : 8,
                    background: t.statusErrorBg, color: t.statusError,
                    fontSize: "0.88rem", marginBottom: 20,
                }}>
                    {error}
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "flex-start" }}>
                {/* Main editor */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Title */}
                    <div style={card}>
                        <label style={labelStyle}>Title</label>
                        <input
                            id="cms-title"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Enter post title..."
                            style={{ ...inputStyle, fontSize: "1.1rem", fontWeight: 700 }}
                        />
                    </div>

                    {/* Excerpt */}
                    <div style={card}>
                        <label style={labelStyle}>Excerpt</label>
                        <textarea
                            id="cms-excerpt"
                            value={excerpt}
                            onChange={e => setExcerpt(e.target.value)}
                            placeholder="Short summary (displayed in listings)..."
                            rows={3}
                            style={{ ...inputStyle, resize: "vertical" as const }}
                        />
                    </div>

                    {/* Content */}
                    <div style={card}>
                        <label style={labelStyle}>Content (Markdown)</label>
                        <textarea
                            id="cms-content"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="Write your post content in Markdown..."
                            rows={20}
                            style={{ ...inputStyle, resize: "vertical" as const, fontFamily: t.fontMono, fontSize: "0.88rem", lineHeight: 1.7 }}
                        />
                    </div>
                </div>

                {/* Sidebar — meta */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "sticky", top: 32 }}>
                    {/* Publish Card */}
                    <div style={card}>
                        <label style={labelStyle}>Content Type</label>
                        <select
                            id="cms-type"
                            value={type}
                            onChange={e => setType(e.target.value)}
                            style={{ ...inputStyle, cursor: "pointer", marginBottom: 16 }}
                        >
                            <option value="NEWS">News</option>
                            <option value="BLOG">Blog</option>
                            <option disabled>Custom Type (Future)</option>
                        </select>

                        <label style={labelStyle}>Slug</label>
                        <input
                            id="cms-slug"
                            value={slug || autoSlug}
                            onChange={e => setSlug(e.target.value)}
                            placeholder="auto-generated-slug"
                            style={{ ...inputStyle, fontFamily: t.fontMono, fontSize: "0.82rem", marginBottom: 16 }}
                        />

                        <label style={labelStyle}>Cover Image URL</label>
                        <input
                            id="cms-cover"
                            value={coverImage}
                            onChange={e => setCoverImage(e.target.value)}
                            placeholder="https://..."
                            style={{ ...inputStyle, marginBottom: 16 }}
                        />

                        {/* Publish toggle */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: t.textSecondary }}>
                                {published ? "Publish immediately" : "Save as draft"}
                            </span>
                            <button
                                id="cms-publish-toggle"
                                onClick={() => setPublished(!published)}
                                style={{
                                    width: 44, height: 24, borderRadius: 12, border: "none",
                                    cursor: "pointer", position: "relative", transition: "background 0.25s",
                                    background: published ? t.statusSuccess : `${t.textMuted}33`,
                                }}
                            >
                                <span style={{
                                    position: "absolute", top: 3,
                                    left: published ? 22 : 3,
                                    width: 18, height: 18, borderRadius: "50%",
                                    background: "#fff", transition: "left 0.25s",
                                }} />
                            </button>
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 10 }}>
                            <button
                                id="cms-save-btn"
                                onClick={handleSave}
                                disabled={saving}
                                style={{
                                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                    padding: "10px 20px", borderRadius: t.buttonRadius,
                                    border: "none", cursor: saving ? "not-allowed" : "pointer",
                                    background: t.statusWarning, color: "#000",
                                    fontWeight: 700, fontSize: "0.875rem",
                                    opacity: saving ? 0.6 : 1,
                                }}
                            >
                                {published ? <Eye style={{ width: 14, height: 14 }} /> : <Save style={{ width: 14, height: 14 }} />}
                                {saving ? "Saving..." : published ? "Publish" : "Save Draft"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
