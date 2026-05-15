"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Newspaper } from "lucide-react";

interface NewsPost {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    coverImage: string | null;
    createdAt: string;
    author: { name: string | null };
}

export default function NewsPage() {
    const [posts, setPosts] = useState<NewsPost[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/cms/posts?type=NEWS&published=true&limit=50")
            .then(r => r.json())
            .then(data => {
                setPosts(data.posts ?? []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const fmtDate = (s: string) =>
        new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container">
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: "60px" }}>
                    <span className="badge badge-cyan" style={{ marginBottom: "16px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Newspaper style={{ width: 14, height: 14 }} /> News
                    </span>
                    <h1
                        style={{
                            fontSize: "clamp(2rem, 5vw, 3.5rem)",
                            fontWeight: 800,
                            marginBottom: "16px",
                            letterSpacing: "-0.03em",
                        }}
                    >
                        Latest <span className="gradient-text">Updates</span>
                    </h1>
                    <p style={{ color: "var(--text-secondary)", maxWidth: "550px", margin: "0 auto", fontSize: "1.05rem" }}>
                        Server updates, bug fixes, and announcements from the NRSP Cloud team.
                    </p>
                </div>

                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: "center", padding: "60px 0" }}>
                        <div style={{
                            width: 40, height: 40,
                            border: "3px solid var(--glass-border)",
                            borderTopColor: "var(--accent-cyan)",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                            margin: "0 auto 16px",
                        }} />
                        <p style={{ color: "var(--text-muted)" }}>Loading news...</p>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}

                {/* Empty */}
                {!loading && posts.length === 0 && (
                    <div className="glass-card" style={{ padding: "80px 40px", textAlign: "center", maxWidth: "500px", margin: "0 auto" }}>
                        <Newspaper style={{ width: 40, height: 40, color: "var(--text-muted)", margin: "0 auto 16px" }} />
                        <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "8px" }}>No news yet</h3>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                            Stay tuned — updates are coming soon.
                        </p>
                    </div>
                )}

                {/* News List — Timeline-style */}
                {!loading && posts.length > 0 && (
                    <div style={{ maxWidth: 720, margin: "0 auto" }}>
                        {posts.map((post, idx) => (
                            <Link
                                key={post.id}
                                href={`/news/${post.slug}`}
                                className="glass-card"
                                style={{
                                    display: "block", textDecoration: "none",
                                    marginBottom: 20, overflow: "hidden",
                                    borderRadius: "var(--radius-lg)",
                                    borderLeft: "4px solid var(--accent-cyan)",
                                }}
                            >
                                {post.coverImage && (
                                    <div style={{
                                        width: "100%", height: 180,
                                        background: `url(${post.coverImage}) center/cover no-repeat`,
                                        borderBottom: "1px solid var(--glass-border)",
                                    }} />
                                )}
                                {!post.coverImage && idx === 0 && (
                                    <div style={{
                                        width: "100%", height: 6,
                                        background: "var(--gradient-primary)",
                                    }} />
                                )}
                                <div style={{ padding: "24px 28px" }}>
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: 12,
                                        marginBottom: 10, fontSize: "0.8rem", color: "var(--text-muted)",
                                    }}>
                                        <span className="mono">{fmtDate(post.createdAt)}</span>
                                        {post.author.name && (
                                            <>
                                                <span style={{ opacity: 0.4 }}>|</span>
                                                <span>{post.author.name}</span>
                                            </>
                                        )}
                                    </div>
                                    <h2 style={{
                                        fontSize: "1.2rem", fontWeight: 700,
                                        color: "var(--text-primary)", marginBottom: 8, lineHeight: 1.3,
                                    }}>
                                        {post.title}
                                    </h2>
                                    {post.excerpt && (
                                        <p style={{
                                            color: "var(--text-secondary)", fontSize: "0.92rem",
                                            lineHeight: 1.6,
                                            display: "-webkit-box", WebkitLineClamp: 2,
                                            WebkitBoxOrient: "vertical", overflow: "hidden",
                                        }}>
                                            {post.excerpt}
                                        </p>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
