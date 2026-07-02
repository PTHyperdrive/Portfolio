"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Plus, FileText, Newspaper, BookOpen, HelpCircle, Trash2, Eye, EyeOff, Pencil, BookMarked } from "lucide-react";

interface CmsPost {
    id: string;
    type: "NEWS" | "BLOG";
    title: string;
    slug: string;
    excerpt: string | null;
    published: boolean;
    createdAt: string;
    author: { id: string; name: string | null };
}

export default function CmsDashboard() {
    const t = useThemeTokens();
    const [posts, setPosts] = useState<CmsPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState<string>("");
    const [publishedFilter, setPublishedFilter] = useState<string>("");
    const [deleting, setDeleting] = useState<string | null>(null);

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (typeFilter) params.set("type", typeFilter);
            if (publishedFilter) params.set("published", publishedFilter);
            params.set("limit", "50");

            const res = await fetch(`/api/cms/posts?${params}`);
            const data = await res.json();
            setPosts(data.posts ?? []);
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, [typeFilter, publishedFilter]);

    useEffect(() => { fetchPosts(); }, [fetchPosts]);

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this post permanently?")) return;
        setDeleting(id);
        try {
            await fetch(`/api/cms/posts/${id}`, { method: "DELETE" });
            setPosts(prev => prev.filter(p => p.id !== id));
        } catch { /* silent */ } finally {
            setDeleting(null);
        }
    };

    const handleTogglePublish = async (id: string, current: boolean) => {
        try {
            const res = await fetch(`/api/cms/posts/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ published: !current }),
            });
            if (res.ok) {
                setPosts(prev => prev.map(p => p.id === id ? { ...p, published: !current } : p));
            }
        } catch { /* silent */ }
    };

    const fmtDate = (s: string) =>
        new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

    const inputStyle: React.CSSProperties = {
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, color: t.textPrimary, fontSize: "0.85rem",
        padding: "8px 12px", outline: "none", cursor: "pointer",
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
                <div>
                    <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>
                        Admin &nbsp;&bull;&nbsp; Content Management
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <FileText style={{ width: 22, height: 22, color: t.statusWarning }} />
                        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>CMS</h1>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <Link href="/adminsystemnrsp/cms/manual" style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "10px 20px", borderRadius: t.buttonRadius,
                        border: `1px solid ${t.borderPrimary}`, background: "transparent",
                        color: t.textSecondary, fontWeight: 600, fontSize: "0.875rem",
                        textDecoration: "none",
                    }}>
                        <BookMarked style={{ width: 14, height: 14 }} />
                        User Manual
                    </Link>
                    <Link href="/adminsystemnrsp/cms/faq" style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "10px 20px", borderRadius: t.buttonRadius,
                        border: `1px solid ${t.borderPrimary}`, background: "transparent",
                        color: t.textSecondary, fontWeight: 600, fontSize: "0.875rem",
                        textDecoration: "none",
                    }}>
                        <HelpCircle style={{ width: 14, height: 14 }} />
                        FAQ Builder
                    </Link>
                    <Link href="/adminsystemnrsp/cms/new" style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "10px 20px", borderRadius: t.buttonRadius,
                        background: t.statusWarning, color: "#000",
                        fontWeight: 700, fontSize: "0.875rem", textDecoration: "none",
                    }}>
                        <Plus style={{ width: 14, height: 14 }} />
                        New Post
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={inputStyle}>
                    <option value="">All Types</option>
                    <option value="NEWS">News</option>
                    <option value="BLOG">Blog</option>
                </select>
                <select value={publishedFilter} onChange={e => setPublishedFilter(e.target.value)} style={inputStyle}>
                    <option value="">All Status</option>
                    <option value="true">Published</option>
                    <option value="false">Draft</option>
                </select>
            </div>

            {/* Posts Table */}
            <div style={card}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: "center", color: t.textMuted }}>Loading posts...</div>
                ) : posts.length === 0 ? (
                    <div style={{ padding: "60px 40px", textAlign: "center" }}>
                        <FileText style={{ width: 40, height: 40, color: t.borderSecondary, margin: "0 auto 16px" }} />
                        <p style={{ color: t.textMuted, fontSize: "0.9rem", marginBottom: 16 }}>No posts found</p>
                        <Link href="/adminsystemnrsp/cms/new" style={{
                            padding: "10px 24px", borderRadius: t.buttonRadius,
                            background: t.statusWarning, color: "#000",
                            fontWeight: 700, fontSize: "0.85rem", textDecoration: "none",
                        }}>
                            Create your first post
                        </Link>
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 680, borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: t.bgSecondary }}>
                                {["Type", "Title", "Author", "Status", "Date", "Actions"].map(h => (
                                    <th key={h} style={{
                                        padding: "11px 20px", textAlign: "left", fontSize: "0.72rem",
                                        fontWeight: 700, color: t.textMuted, textTransform: "uppercase",
                                        letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}`,
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {posts.map((post, idx) => (
                                <tr key={post.id} style={{
                                    borderBottom: idx < posts.length - 1 ? `1px solid ${t.borderSecondary}` : "none",
                                    transition: "background 0.12s",
                                }}
                                    onMouseEnter={e => (e.currentTarget.style.background = t.bgCardHover)}
                                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                >
                                    <td style={{ padding: "14px 20px" }}>
                                        <span style={{
                                            display: "inline-flex", alignItems: "center", gap: 6,
                                            padding: "3px 10px", borderRadius: 12, fontSize: "0.72rem", fontWeight: 700,
                                            background: post.type === "NEWS" ? t.accentPrimaryMuted : t.statusSuccessBg,
                                            color: post.type === "NEWS" ? t.accentPrimary : t.statusSuccess,
                                        }}>
                                            {post.type === "NEWS" ? <Newspaper style={{ width: 11, height: 11 }} /> : <BookOpen style={{ width: 11, height: 11 }} />}
                                            {post.type}
                                        </span>
                                    </td>
                                    <td style={{ padding: "14px 20px" }}>
                                        <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.88rem" }}>{post.title}</p>
                                        <p style={{ fontSize: "0.72rem", color: t.textMuted, fontFamily: t.fontMono, marginTop: 2 }}>/{post.slug}</p>
                                    </td>
                                    <td style={{ padding: "14px 20px", fontSize: "0.82rem", color: t.textSecondary }}>
                                        {post.author.name || "Admin"}
                                    </td>
                                    <td style={{ padding: "14px 20px" }}>
                                        <span style={{
                                            padding: "2px 10px", borderRadius: 12, fontSize: "0.72rem", fontWeight: 700,
                                            background: post.published ? t.statusSuccessBg : `${t.textMuted}1a`,
                                            color: post.published ? t.statusSuccess : t.textMuted,
                                        }}>
                                            {post.published ? "Published" : "Draft"}
                                        </span>
                                    </td>
                                    <td style={{ padding: "14px 20px", fontSize: "0.82rem", color: t.textMuted }}>
                                        {fmtDate(post.createdAt)}
                                    </td>
                                    <td style={{ padding: "14px 20px" }}>
                                        <div style={{ display: "flex", gap: 6 }}>
                                            <Link href={`/adminsystemnrsp/cms/${post.id}/edit`} title="Edit" style={{
                                                width: 32, height: 32, borderRadius: t.buttonRadius,
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                border: `1px solid ${t.borderPrimary}`, color: t.textSecondary,
                                                textDecoration: "none",
                                            }}>
                                                <Pencil style={{ width: 13, height: 13 }} />
                                            </Link>
                                            <button onClick={() => handleTogglePublish(post.id, post.published)} title={post.published ? "Unpublish" : "Publish"} style={{
                                                width: 32, height: 32, borderRadius: t.buttonRadius,
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                                color: post.published ? t.statusSuccess : t.textMuted, cursor: "pointer",
                                            }}>
                                                {post.published ? <Eye style={{ width: 13, height: 13 }} /> : <EyeOff style={{ width: 13, height: 13 }} />}
                                            </button>
                                            <button onClick={() => handleDelete(post.id)} disabled={deleting === post.id} title="Delete" style={{
                                                width: 32, height: 32, borderRadius: t.buttonRadius,
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                                color: t.statusError, cursor: "pointer",
                                                opacity: deleting === post.id ? 0.5 : 1,
                                            }}>
                                                <Trash2 style={{ width: 13, height: 13 }} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                )}
            </div>
        </div>
    );
}
