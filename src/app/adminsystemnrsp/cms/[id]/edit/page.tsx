"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { ArrowLeft, Save, Eye, Trash2 } from "lucide-react";

export default function CmsEditPost() {
    const t = useThemeTokens();
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [type, setType] = useState<string>("NEWS");
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [content, setContent] = useState("");
    const [coverImage, setCoverImage] = useState("");
    const [published, setPublished] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(`/api/cms/posts/${id}`)
            .then(r => r.json())
            .then(data => {
                if (data.post) {
                    const p = data.post;
                    setType(p.type);
                    setTitle(p.title);
                    setSlug(p.slug);
                    setExcerpt(p.excerpt || "");
                    setContent(p.content || "");
                    setCoverImage(p.coverImage || "");
                    setPublished(p.published);
                }
            })
            .catch(() => setError("Failed to load post"))
            .finally(() => setLoading(false));
    }, [id]);

    const handleSave = async () => {
        setError("");
        if (!title.trim()) { setError("Title is required."); return; }
        if (!content.trim()) { setError("Content is required."); return; }

        setSaving(true);
        try {
            const res = await fetch(`/api/cms/posts/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type, title: title.trim(), slug: slug.trim(),
                    excerpt: excerpt.trim() || null,
                    content: content.trim(),
                    coverImage: coverImage.trim() || null,
                    published,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || "Failed to update"); return; }
            router.push("/adminsystemnrsp/cms");
        } catch {
            setError("Network error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Delete this post permanently?")) return;
        try {
            await fetch(`/api/cms/posts/${id}`, { method: "DELETE" });
            router.push("/adminsystemnrsp/cms");
        } catch { /* silent */ }
    };

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow, padding: "28px",
    };

    const inputStyle: React.CSSProperties = {
        width: "100%", boxSizing: "border-box" as const,
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.isMono ? 0 : 8, color: t.textPrimary,
        fontSize: "0.9rem", padding: "10px 14px", outline: "none",
    };

    const labelStyle: React.CSSProperties = {
        display: "block", fontSize: "0.78rem", fontWeight: 700,
        color: t.textMuted, textTransform: "uppercase" as const,
        letterSpacing: "0.06em", marginBottom: 6,
    };

    if (loading) {
        return (
            <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: t.bgPrimary }}>
                <p style={{ color: t.textMuted }}>Loading post...</p>
            </div>
        );
    }

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <Link href="/adminsystemnrsp/cms" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                color: t.textMuted, fontSize: "0.82rem", textDecoration: "none",
                marginBottom: 20,
            }}>
                <ArrowLeft style={{ width: 14, height: 14 }} /> Back to CMS
            </Link>

            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary, marginBottom: 28 }}>
                Edit Post
            </h1>

            {error && (
                <div style={{
                    padding: "12px 18px", borderRadius: t.isMono ? 0 : 8,
                    background: t.statusErrorBg, color: t.statusError,
                    fontSize: "0.88rem", marginBottom: 20,
                }}>
                    {error}
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "flex-start" }}>
                {/* Main editor */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={card}>
                        <label style={labelStyle}>Title</label>
                        <input id="cms-title" value={title} onChange={e => setTitle(e.target.value)} style={{ ...inputStyle, fontSize: "1.1rem", fontWeight: 700 }} />
                    </div>

                    <div style={card}>
                        <label style={labelStyle}>Excerpt</label>
                        <textarea id="cms-excerpt" value={excerpt} onChange={e => setExcerpt(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />
                    </div>

                    <div style={card}>
                        <label style={labelStyle}>Content (Markdown)</label>
                        <textarea id="cms-content" value={content} onChange={e => setContent(e.target.value)} rows={20}
                            style={{ ...inputStyle, resize: "vertical" as const, fontFamily: t.fontMono, fontSize: "0.88rem", lineHeight: 1.7 }}
                        />
                    </div>
                </div>

                {/* Sidebar */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "sticky", top: 32 }}>
                    <div style={card}>
                        <label style={labelStyle}>Content Type</label>
                        <select id="cms-type" value={type} onChange={e => setType(e.target.value)} style={{ ...inputStyle, cursor: "pointer", marginBottom: 16 }}>
                            <option value="NEWS">News</option>
                            <option value="BLOG">Blog</option>
                            <option disabled>Custom Type (Future)</option>
                        </select>

                        <label style={labelStyle}>Slug</label>
                        <input id="cms-slug" value={slug} onChange={e => setSlug(e.target.value)} style={{ ...inputStyle, fontFamily: t.fontMono, fontSize: "0.82rem", marginBottom: 16 }} />

                        <label style={labelStyle}>Cover Image URL</label>
                        <input id="cms-cover" value={coverImage} onChange={e => setCoverImage(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: t.textSecondary }}>
                                {published ? "Published" : "Draft"}
                            </span>
                            <button onClick={() => setPublished(!published)} style={{
                                width: 44, height: 24, borderRadius: 12, border: "none",
                                cursor: "pointer", position: "relative", transition: "background 0.25s",
                                background: published ? t.statusSuccess : `${t.textMuted}33`,
                            }}>
                                <span style={{
                                    position: "absolute", top: 3, left: published ? 22 : 3,
                                    width: 18, height: 18, borderRadius: "50%",
                                    background: "#fff", transition: "left 0.25s",
                                }} />
                            </button>
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                            <button id="cms-save-btn" onClick={handleSave} disabled={saving} style={{
                                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                padding: "10px 20px", borderRadius: t.buttonRadius,
                                border: "none", cursor: saving ? "not-allowed" : "pointer",
                                background: t.statusWarning, color: "#000",
                                fontWeight: 700, fontSize: "0.875rem", opacity: saving ? 0.6 : 1,
                            }}>
                                {published ? <Eye style={{ width: 14, height: 14 }} /> : <Save style={{ width: 14, height: 14 }} />}
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </div>

                    {/* Danger zone */}
                    <div style={{ ...card, borderColor: `${t.statusError}33` }}>
                        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: t.statusError, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Danger Zone</p>
                        <button onClick={handleDelete} style={{
                            display: "flex", alignItems: "center", gap: 8, width: "100%",
                            padding: "10px", borderRadius: t.buttonRadius, cursor: "pointer",
                            border: `1px solid ${t.statusError}33`, background: t.statusErrorBg,
                            color: t.statusError, fontWeight: 600, fontSize: "0.85rem",
                        }}>
                            <Trash2 style={{ width: 14, height: 14 }} /> Delete Post
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
