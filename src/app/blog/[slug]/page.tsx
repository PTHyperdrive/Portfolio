"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface BlogPost {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    content: string;
    coverImage: string | null;
    published: boolean;
    createdAt: string;
    updatedAt: string;
    author: { name: string | null; image: string | null };
}

export default function BlogPostPage() {
    const params = useParams();
    const slug = params.slug as string;

    const [post, setPost] = useState<BlogPost | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!slug) return;
        fetch(`/api/blog/${slug}`)
            .then((res) => {
                if (!res.ok) throw new Error("Not found");
                return res.json();
            })
            .then((data) => {
                setPost(data);
                setLoading(false);
            })
            .catch(() => {
                setError(true);
                setLoading(false);
            });
    }, [slug]);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    if (loading) {
        return (
            <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
                <div className="container" style={{ textAlign: "center", padding: "100px 0" }}>
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            border: "3px solid var(--glass-border)",
                            borderTopColor: "var(--accent-cyan)",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                            margin: "0 auto 16px",
                        }}
                    />
                    <p style={{ color: "var(--text-muted)" }}>Loading article...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    if (error || !post) {
        return (
            <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
                <div className="container" style={{ textAlign: "center", padding: "100px 0" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "16px" }}>🔍</div>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "12px" }}>
                        Post Not Found
                    </h1>
                    <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>
                        The article you&apos;re looking for doesn&apos;t exist or has been removed.
                    </p>
                    <Link href="/blog" className="btn btn-secondary">
                        ← Back to Blog
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: "800px" }}>
                {/* Back Link */}
                <Link
                    href="/blog"
                    style={{
                        color: "var(--text-muted)",
                        textDecoration: "none",
                        fontSize: "0.88rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "32px",
                        transition: "color 0.2s",
                    }}
                >
                    ← Back to Blog
                </Link>

                {/* Article Header */}
                <article>
                    {/* Draft Badge */}
                    {!post.published && (
                        <span
                            className="badge badge-magenta"
                            style={{ marginBottom: "16px", display: "inline-block" }}
                        >
                            DRAFT
                        </span>
                    )}

                    {/* Title */}
                    <h1
                        style={{
                            fontSize: "clamp(2rem, 5vw, 3rem)",
                            fontWeight: 800,
                            lineHeight: 1.15,
                            marginBottom: "20px",
                            letterSpacing: "-0.03em",
                        }}
                    >
                        {post.title}
                    </h1>

                    {/* Meta */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "16px",
                            marginBottom: "32px",
                            padding: "16px 0",
                            borderBottom: "1px solid var(--glass-border)",
                        }}
                    >
                        {/* Author Avatar */}
                        <div
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: "50%",
                                background: "var(--gradient-primary)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "0.9rem",
                                color: "var(--text-inverse)",
                                flexShrink: 0,
                            }}
                        >
                            {post.author.name?.[0]?.toUpperCase() || "A"}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                                {post.author.name || "Admin"}
                            </div>
                            <div
                                className="mono"
                                style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}
                            >
                                {formatDate(post.createdAt)}
                            </div>
                        </div>
                    </div>

                    {/* Cover Image */}
                    {post.coverImage && (
                        <div
                            style={{
                                width: "100%",
                                height: "400px",
                                borderRadius: "var(--radius-lg)",
                                background: `url(${post.coverImage}) center/cover no-repeat`,
                                marginBottom: "40px",
                                border: "1px solid var(--glass-border)",
                            }}
                        />
                    )}

                    {/* Content */}
                    <div
                        style={{
                            fontSize: "1.05rem",
                            lineHeight: 1.85,
                            color: "var(--text-secondary)",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                        }}
                    >
                        {post.content}
                    </div>

                    {/* Bottom Divider */}
                    <div
                        style={{
                            borderTop: "1px solid var(--glass-border)",
                            marginTop: "60px",
                            paddingTop: "32px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <Link href="/blog" className="btn btn-ghost">
                            ← More Articles
                        </Link>
                        <span className="mono" style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                            Updated {formatDate(post.updatedAt)}
                        </span>
                    </div>
                </article>
            </div>
        </div>
    );
}
