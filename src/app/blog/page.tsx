"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface BlogPostSummary {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    coverImage: string | null;
    createdAt: string;
    author: { name: string | null };
}

export default function BlogPage() {
    const [posts, setPosts] = useState<BlogPostSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/blog")
            .then((res) => res.json())
            .then((data) => {
                setPosts(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container">
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: "60px" }}>
                    <span className="badge badge-cyan" style={{ marginBottom: "16px", display: "inline-block" }}>
                        ✍️ Blog
                    </span>
                    <h1
                        style={{
                            fontSize: "clamp(2rem, 5vw, 3.5rem)",
                            fontWeight: 800,
                            marginBottom: "16px",
                            letterSpacing: "-0.03em",
                        }}
                    >
                        Latest <span className="gradient-text">Articles</span>
                    </h1>
                    <p style={{ color: "var(--text-secondary)", maxWidth: "550px", margin: "0 auto", fontSize: "1.05rem" }}>
                        Insights on cloud infrastructure, cybersecurity, and modern tech from our team.
                    </p>
                </div>

                {/* Loading State */}
                {loading && (
                    <div style={{ textAlign: "center", padding: "60px 0" }}>
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
                        <p style={{ color: "var(--text-muted)" }}>Loading posts...</p>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}

                {/* Empty State */}
                {!loading && posts.length === 0 && (
                    <div
                        className="glass-card"
                        style={{
                            padding: "80px 40px",
                            textAlign: "center",
                            maxWidth: "500px",
                            margin: "0 auto",
                        }}
                    >
                        <div style={{ fontSize: "3rem", marginBottom: "16px" }}>📝</div>
                        <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "8px" }}>
                            No posts yet
                        </h3>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                            Stay tuned — new articles are coming soon.
                        </p>
                    </div>
                )}

                {/* Posts Grid */}
                {!loading && posts.length > 0 && (
                    <div className="grid-2 stagger" style={{ gap: "28px" }}>
                        {posts.map((post, index) => (
                            <Link
                                key={post.id}
                                href={`/blog/${post.slug}`}
                                className="glass-card"
                                style={{
                                    textDecoration: "none",
                                    display: "flex",
                                    flexDirection: "column",
                                    overflow: "hidden",
                                    borderRadius: "var(--radius-lg)",
                                }}
                            >
                                {/* Cover Image */}
                                {post.coverImage && (
                                    <div
                                        style={{
                                            width: "100%",
                                            height: "200px",
                                            background: `url(${post.coverImage}) center/cover no-repeat`,
                                            borderBottom: "1px solid var(--glass-border)",
                                        }}
                                    />
                                )}

                                {/* No cover — gradient accent */}
                                {!post.coverImage && (
                                    <div
                                        style={{
                                            width: "100%",
                                            height: "8px",
                                            background: index % 2 === 0 ? "var(--gradient-primary)" : "var(--gradient-secondary)",
                                        }}
                                    />
                                )}

                                <div style={{ padding: "28px" }}>
                                    {/* Date & Author */}
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "12px",
                                            marginBottom: "12px",
                                            fontSize: "0.8rem",
                                            color: "var(--text-muted)",
                                        }}
                                    >
                                        <span className="mono">{formatDate(post.createdAt)}</span>
                                        {post.author.name && (
                                            <>
                                                <span style={{ opacity: 0.4 }}>•</span>
                                                <span>{post.author.name}</span>
                                            </>
                                        )}
                                    </div>

                                    {/* Title */}
                                    <h2
                                        style={{
                                            fontSize: "1.25rem",
                                            fontWeight: 700,
                                            color: "var(--text-primary)",
                                            marginBottom: "10px",
                                            lineHeight: 1.3,
                                        }}
                                    >
                                        {post.title}
                                    </h2>

                                    {/* Excerpt */}
                                    {post.excerpt && (
                                        <p
                                            style={{
                                                color: "var(--text-secondary)",
                                                fontSize: "0.92rem",
                                                lineHeight: 1.6,
                                                marginBottom: "16px",
                                                display: "-webkit-box",
                                                WebkitLineClamp: 3,
                                                WebkitBoxOrient: "vertical",
                                                overflow: "hidden",
                                            }}
                                        >
                                            {post.excerpt}
                                        </p>
                                    )}

                                    {/* Read More */}
                                    <span
                                        style={{
                                            color: "var(--accent-cyan)",
                                            fontSize: "0.85rem",
                                            fontWeight: 600,
                                        }}
                                    >
                                        Read more →
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
