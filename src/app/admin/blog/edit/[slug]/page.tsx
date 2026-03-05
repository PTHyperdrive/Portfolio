"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

export default function EditBlogPostPage() {
    const router = useRouter();
    const params = useParams();
    const slug = params.slug as string;

    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        title: "",
        slug: "",
        excerpt: "",
        content: "",
        coverImage: "",
        published: false,
    });

    useEffect(() => {
        if (!slug) return;
        fetch(`/api/blog/${slug}`)
            .then((res) => {
                if (!res.ok) throw new Error("Not found");
                return res.json();
            })
            .then((data) => {
                setForm({
                    title: data.title || "",
                    slug: data.slug || "",
                    excerpt: data.excerpt || "",
                    content: data.content || "",
                    coverImage: data.coverImage || "",
                    published: data.published || false,
                });
                setLoading(false);
            })
            .catch(() => {
                setError("Post not found");
                setLoading(false);
            });
    }, [slug]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSaving(true);

        try {
            const res = await fetch(`/api/blog/${slug}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: form.title,
                    slug: form.slug,
                    excerpt: form.excerpt || null,
                    content: form.content,
                    coverImage: form.coverImage || null,
                    published: form.published,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to update post");
            }

            router.push("/admin/blog");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
                <div className="container" style={{ maxWidth: "800px", textAlign: "center", padding: "100px 0" }}>
                    <p style={{ color: "var(--text-muted)" }}>Loading post...</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: "800px" }}>
                {/* Header */}
                <div style={{ marginBottom: "32px" }}>
                    <Link
                        href="/admin/blog"
                        style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.88rem", marginBottom: "12px", display: "inline-block" }}
                    >
                        ← Back to Blog Management
                    </Link>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800 }}>
                        Edit <span className="gradient-text">Post</span>
                    </h1>
                </div>

                {/* Error */}
                {error && (
                    <div
                        style={{
                            padding: "14px 20px",
                            borderRadius: "var(--radius-sm)",
                            background: "rgba(255, 0, 110, 0.1)",
                            border: "1px solid rgba(255, 0, 110, 0.3)",
                            color: "var(--accent-magenta)",
                            marginBottom: "24px",
                            fontSize: "0.9rem",
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <div className="glass-card" style={{ padding: "32px", marginBottom: "24px" }}>
                        {/* Title */}
                        <div style={{ marginBottom: "20px" }}>
                            <label style={{ display: "block", fontWeight: 600, fontSize: "0.88rem", marginBottom: "8px", color: "var(--text-secondary)" }}>
                                Title *
                            </label>
                            <input
                                className="input-field"
                                value={form.title}
                                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                                placeholder="Enter post title..."
                                required
                            />
                        </div>

                        {/* Slug */}
                        <div style={{ marginBottom: "20px" }}>
                            <label style={{ display: "block", fontWeight: 600, fontSize: "0.88rem", marginBottom: "8px", color: "var(--text-secondary)" }}>
                                Slug *
                            </label>
                            <input
                                className="input-field mono"
                                value={form.slug}
                                onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                                placeholder="post-url-slug"
                                required
                                style={{ fontSize: "0.88rem" }}
                            />
                            <p className="mono" style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "4px" }}>
                                /blog/{form.slug || "..."}
                            </p>
                        </div>

                        {/* Excerpt */}
                        <div style={{ marginBottom: "20px" }}>
                            <label style={{ display: "block", fontWeight: 600, fontSize: "0.88rem", marginBottom: "8px", color: "var(--text-secondary)" }}>
                                Excerpt
                            </label>
                            <textarea
                                className="input-field"
                                value={form.excerpt}
                                onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
                                placeholder="Brief summary for the card preview..."
                                rows={3}
                                style={{ resize: "vertical" }}
                            />
                        </div>

                        {/* Cover Image */}
                        <div style={{ marginBottom: "20px" }}>
                            <label style={{ display: "block", fontWeight: 600, fontSize: "0.88rem", marginBottom: "8px", color: "var(--text-secondary)" }}>
                                Cover Image URL
                            </label>
                            <input
                                className="input-field"
                                value={form.coverImage}
                                onChange={(e) => setForm((prev) => ({ ...prev, coverImage: e.target.value }))}
                                placeholder="https://example.com/image.jpg"
                            />
                        </div>

                        {/* Content */}
                        <div style={{ marginBottom: "20px" }}>
                            <label style={{ display: "block", fontWeight: 600, fontSize: "0.88rem", marginBottom: "8px", color: "var(--text-secondary)" }}>
                                Content *
                            </label>
                            <textarea
                                className="input-field mono"
                                value={form.content}
                                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                                placeholder="Write your blog post content here..."
                                rows={16}
                                required
                                style={{ resize: "vertical", fontSize: "0.88rem", lineHeight: 1.7 }}
                            />
                        </div>

                        {/* Publish Toggle */}
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <label
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    cursor: "pointer",
                                    fontSize: "0.9rem",
                                    fontWeight: 600,
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={form.published}
                                    onChange={(e) => setForm((prev) => ({ ...prev, published: e.target.checked }))}
                                    style={{ width: 18, height: 18, accentColor: "var(--accent-cyan)", cursor: "pointer" }}
                                />
                                Published
                            </label>
                            <span className={`badge ${form.published ? "badge-green" : "badge-magenta"}`}>
                                {form.published ? "PUBLISHED" : "DRAFT"}
                            </span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                        <Link href="/admin/blog" className="btn btn-ghost">
                            Cancel
                        </Link>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
