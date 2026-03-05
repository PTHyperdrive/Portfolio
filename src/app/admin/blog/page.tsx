"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface BlogPost {
    id: string;
    title: string;
    slug: string;
    published: boolean;
    createdAt: string;
    updatedAt: string;
}

export default function AdminBlogPage() {
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchPosts = async () => {
        setLoading(true);
        try {
            // Admin endpoint — fetch ALL posts including drafts
            const res = await fetch("/api/blog/admin");
            const data = await res.json();
            setPosts(Array.isArray(data) ? data : []);
        } catch {
            setPosts([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchPosts();
    }, []);

    const deletePost = async (slug: string) => {
        if (!confirm("Are you sure you want to delete this post?")) return;
        try {
            const res = await fetch(`/api/blog/${slug}`, { method: "DELETE" });
            if (res.ok) {
                setPosts((prev) => prev.filter((p) => p.slug !== slug));
            }
        } catch {
            alert("Failed to delete post");
        }
    };

    const togglePublish = async (slug: string, currentStatus: boolean) => {
        try {
            const res = await fetch(`/api/blog/${slug}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ published: !currentStatus }),
            });
            if (res.ok) {
                setPosts((prev) =>
                    prev.map((p) => (p.slug === slug ? { ...p, published: !currentStatus } : p))
                );
            }
        } catch {
            alert("Failed to update post");
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container">
                {/* Header */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "40px",
                        flexWrap: "wrap",
                        gap: "16px",
                    }}
                >
                    <div>
                        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "4px" }}>
                            Blog <span className="gradient-text">Management</span>
                        </h1>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                            Create, edit, and manage your blog posts.
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                        <Link href="/admin" className="btn btn-ghost">
                            ← Admin
                        </Link>
                        <Link href="/admin/blog/new" className="btn btn-primary">
                            + New Post
                        </Link>
                    </div>
                </div>

                {/* Loading */}
                {loading && (
                    <div className="glass-card" style={{ padding: "60px", textAlign: "center" }}>
                        <p style={{ color: "var(--text-muted)" }}>Loading posts...</p>
                    </div>
                )}

                {/* Empty State */}
                {!loading && posts.length === 0 && (
                    <div className="glass-card" style={{ padding: "60px", textAlign: "center" }}>
                        <div style={{ fontSize: "3rem", marginBottom: "16px" }}>📝</div>
                        <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "8px" }}>
                            No blog posts yet
                        </h3>
                        <p style={{ color: "var(--text-muted)", marginBottom: "20px" }}>
                            Create your first blog post to get started.
                        </p>
                        <Link href="/admin/blog/new" className="btn btn-primary">
                            Create First Post
                        </Link>
                    </div>
                )}

                {/* Posts Table */}
                {!loading && posts.length > 0 && (
                    <div className="glass-card" style={{ overflow: "hidden" }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Updated</th>
                                    <th style={{ textAlign: "right" }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {posts.map((post) => (
                                    <tr key={post.id}>
                                        <td>
                                            <Link
                                                href={`/blog/${post.slug}`}
                                                style={{
                                                    color: "var(--text-primary)",
                                                    textDecoration: "none",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {post.title}
                                            </Link>
                                            <div className="mono" style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "2px" }}>
                                                /{post.slug}
                                            </div>
                                        </td>
                                        <td>
                                            <span
                                                className={`badge ${post.published ? "badge-green" : "badge-magenta"}`}
                                                style={{ cursor: "pointer" }}
                                                onClick={() => togglePublish(post.slug, post.published)}
                                                title="Click to toggle"
                                            >
                                                {post.published ? "PUBLISHED" : "DRAFT"}
                                            </span>
                                        </td>
                                        <td className="mono" style={{ fontSize: "0.82rem" }}>
                                            {formatDate(post.createdAt)}
                                        </td>
                                        <td className="mono" style={{ fontSize: "0.82rem" }}>
                                            {formatDate(post.updatedAt)}
                                        </td>
                                        <td style={{ textAlign: "right" }}>
                                            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                                                <Link
                                                    href={`/admin/blog/edit/${post.slug}`}
                                                    className="btn btn-ghost"
                                                    style={{ padding: "6px 14px", fontSize: "0.8rem" }}
                                                >
                                                    Edit
                                                </Link>
                                                <button
                                                    onClick={() => deletePost(post.slug)}
                                                    className="btn btn-danger"
                                                    style={{ padding: "6px 14px", fontSize: "0.8rem" }}
                                                >
                                                    Delete
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
