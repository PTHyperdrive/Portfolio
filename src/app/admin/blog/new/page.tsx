"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewBlogPostPage() {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        title: "",
        slug: "",
        excerpt: "",
        content: "",
        coverImage: "",
        published: false,
    });

    const generateSlug = (title: string) => {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    };

    const handleTitleChange = (value: string) => {
        setForm((prev) => ({
            ...prev,
            title: value,
            slug: generateSlug(value),
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSaving(true);

        try {
            const res = await fetch("/api/blog", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to create post");
            }

            router.push("/admin/blog");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
            setSaving(false);
        }
    };

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
                        New <span className="gradient-text">Post</span>
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
                                onChange={(e) => handleTitleChange(e.target.value)}
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
                                Publish immediately
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
                            {saving ? "Creating..." : "Create Post"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
