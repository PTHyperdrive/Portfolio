"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Toolbar Button ──────────────────────────────────────────────────────────
function ToolBtn({ label, onClick, title }: { label: string; onClick: () => void; title?: string }) {
    return (
        <button
            type="button"
            title={title ?? label}
            onClick={onClick}
            style={{
                padding: "5px 10px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px",
                color: "var(--text-secondary)",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: "pointer",
                lineHeight: 1,
                transition: "background 0.15s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = "rgba(0,240,255,0.12)")}
            onMouseOut={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
        >
            {label}
        </button>
    );
}

// ─── Tag Pill ────────────────────────────────────────────────────────────────
function TagPill({ tag, onRemove }: { tag: string; onRemove: () => void }) {
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "4px 10px", borderRadius: "20px",
            background: "rgba(0,240,255,0.1)",
            border: "1px solid rgba(0,240,255,0.25)",
            color: "var(--accent-cyan)", fontSize: "0.78rem", fontWeight: 600,
        }}>
            {tag}
            <button
                type="button"
                onClick={onRemove}
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: "0.9rem" }}
            >×</button>
        </span>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function NewBlogPostPage() {
    const router = useRouter();
    const [saving, setSaving]       = useState(false);
    const [saveDraft, setSaveDraft] = useState(false);
    const [error, setError]         = useState("");
    const [tagInput, setTagInput]   = useState("");
    const [preview, setPreview]     = useState(false);

    const [form, setForm] = useState({
        title:       "",
        slug:        "",
        excerpt:     "",
        content:     "",
        coverImage:  "",
        publisher:   "NOTRESPOND LABS",
        tags:        [] as string[],
        published:   false,
    });

    // ── Derived helpers ──────────────────────────────────────────────
    const generateSlug = (title: string) =>
        title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const handleTitleChange = (value: string) =>
        setForm((prev) => ({ ...prev, title: value, slug: generateSlug(value) }));

    const addTag = () => {
        const clean = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
        if (!clean || form.tags.includes(clean)) { setTagInput(""); return; }
        setForm((prev) => ({ ...prev, tags: [...prev.tags, clean] }));
        setTagInput("");
    };

    const removeTag = (tag: string) =>
        setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));

    // ── Markdown toolbar helpers (insert at cursor) ──────────────────
    const insertMarkdown = (before: string, after = "") => {
        const ta = document.getElementById("content-editor") as HTMLTextAreaElement | null;
        if (!ta) return;
        const { selectionStart: s, selectionEnd: e, value } = ta;
        const selected = value.slice(s, e);
        const newVal = value.slice(0, s) + before + selected + after + value.slice(e);
        setForm((prev) => ({ ...prev, content: newVal }));
        setTimeout(() => {
            ta.focus();
            ta.setSelectionRange(s + before.length, s + before.length + selected.length);
        }, 0);
    };

    // ── Submit ───────────────────────────────────────────────────────
    const submit = async (publishNow: boolean) => {
        setError("");
        publishNow ? setSaving(true) : setSaveDraft(true);

        // Serialize tags + publisher into a metadata block appended to content
        // This avoids a schema migration while keeping data fully recoverable.
        const metaBlock = `\n\n<!--notrespond-meta:${JSON.stringify({ tags: form.tags, publisher: form.publisher })}-->`;
        const finalContent = form.content + metaBlock;

        try {
            const res = await fetch("/api/blog", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({
                    title:      form.title,
                    slug:       form.slug,
                    excerpt:    form.excerpt || null,
                    content:    finalContent,
                    coverImage: form.coverImage || null,
                    published:  publishNow,
                }),
            });

            if (!res.ok) {
                const data = await res.json() as { error?: string };
                throw new Error(data.error ?? "Failed to create post");
            }

            router.push("/admin/blog");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setSaving(false);
            setSaveDraft(false);
        }
    };

    const wordCount = form.content.trim().split(/\s+/).filter(Boolean).length;
    const readTime  = Math.max(1, Math.ceil(wordCount / 200));

    // ─── Render ──────────────────────────────────────────────────────
    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh", paddingBottom: "80px" }}>
            <div className="container" style={{ maxWidth: "960px" }}>

                {/* Breadcrumb */}
                <Link href="/admin/blog" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.85rem", display: "inline-block", marginBottom: "16px" }}>
                    ← Blog Management
                </Link>

                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "4px" }}>
                            New <span className="gradient-text">Post</span>
                        </h1>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                            {wordCount} words · ~{readTime} min read
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <button
                            type="button"
                            onClick={() => setPreview(!preview)}
                            className="btn btn-ghost"
                            style={{ padding: "8px 18px", fontSize: "0.85rem" }}
                        >
                            {preview ? "✏️ Edit" : "👁 Preview"}
                        </button>
                        <button type="button" onClick={() => submit(false)} disabled={saveDraft || saving} className="btn btn-secondary" style={{ padding: "8px 18px", fontSize: "0.85rem" }}>
                            {saveDraft ? "Saving…" : "💾 Save Draft"}
                        </button>
                        <button type="button" onClick={() => submit(true)}  disabled={saving || saveDraft}  className="btn btn-primary"  style={{ padding: "8px 22px", fontSize: "0.85rem" }}>
                            {saving ? "Publishing…" : "🚀 Publish"}
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div style={{ padding: "14px 20px", borderRadius: "var(--radius-sm)", background: "rgba(255,0,110,0.1)", border: "1px solid rgba(255,0,110,0.3)", color: "var(--accent-magenta)", marginBottom: "24px", fontSize: "0.9rem", display: "flex", justifyContent: "space-between" }}>
                        <span>{error}</span>
                        <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
                    </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px", alignItems: "start" }}>

                    {/* ── Left column: Main editor ─────────────────── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

                        {/* Title */}
                        <div className="glass-card" style={{ padding: "24px" }}>
                            <label style={{ display: "block", fontWeight: 700, fontSize: "0.82rem", marginBottom: "8px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Blog Title *
                            </label>
                            <input
                                className="input-field"
                                value={form.title}
                                onChange={(e) => handleTitleChange(e.target.value)}
                                placeholder="Enter a compelling post title…"
                                required
                                style={{ fontSize: "1.1rem", fontWeight: 600 }}
                            />
                            {/* Slug preview */}
                            <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>URL:</span>
                                <code style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", background: "rgba(0,240,255,0.06)", padding: "2px 8px", borderRadius: "4px" }}>
                                    /blog/{form.slug || "post-slug"}
                                </code>
                                <input
                                    className="input-field mono"
                                    value={form.slug}
                                    onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                                    placeholder="post-url-slug"
                                    required
                                    style={{ fontSize: "0.78rem", flex: 1, padding: "4px 10px" }}
                                />
                            </div>
                        </div>

                        {/* Rich-text editor (Markdown with toolbar) */}
                        <div className="glass-card" style={{ padding: "24px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                <label style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                    Content *
                                </label>
                                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Markdown supported</span>
                            </div>

                            {/* Toolbar */}
                            {!preview && (
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                    <ToolBtn label="B"      title="Bold"          onClick={() => insertMarkdown("**", "**")} />
                                    <ToolBtn label="I"      title="Italic"        onClick={() => insertMarkdown("_", "_")} />
                                    <ToolBtn label="~~"     title="Strikethrough" onClick={() => insertMarkdown("~~", "~~")} />
                                    <ToolBtn label="H1"     title="Heading 1"     onClick={() => insertMarkdown("# ")} />
                                    <ToolBtn label="H2"     title="Heading 2"     onClick={() => insertMarkdown("## ")} />
                                    <ToolBtn label="H3"     title="Heading 3"     onClick={() => insertMarkdown("### ")} />
                                    <ToolBtn label="— hr"   title="Horizontal rule" onClick={() => insertMarkdown("\n\n---\n\n")} />
                                    <ToolBtn label="` `"    title="Inline code"   onClick={() => insertMarkdown("`", "`")} />
                                    <ToolBtn label="```"    title="Code block"    onClick={() => insertMarkdown("\n```\n", "\n```\n")} />
                                    <ToolBtn label="🔗"    title="Link"          onClick={() => insertMarkdown("[", "](url)")} />
                                    <ToolBtn label="• List" title="Bullet list"   onClick={() => insertMarkdown("\n- ")} />
                                    <ToolBtn label="1. List" title="Numbered list" onClick={() => insertMarkdown("\n1. ")} />
                                    <ToolBtn label="❝"     title="Blockquote"    onClick={() => insertMarkdown("\n> ")} />
                                </div>
                            )}

                            {preview ? (
                                /* Markdown preview — rendered as pre-formatted for now */
                                <div style={{
                                    minHeight: "420px", padding: "16px",
                                    background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-sm)",
                                    color: "var(--text-secondary)", lineHeight: 1.8,
                                    fontSize: "0.92rem", whiteSpace: "pre-wrap", fontFamily: "inherit",
                                }}>
                                    {form.content || <span style={{ color: "var(--text-muted)" }}>Nothing to preview yet…</span>}
                                </div>
                            ) : (
                                <textarea
                                    id="content-editor"
                                    className="input-field mono"
                                    value={form.content}
                                    onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                                    placeholder={"# Your Post Title\n\nStart writing in Markdown…"}
                                    rows={22}
                                    required
                                    style={{ resize: "vertical", fontSize: "0.88rem", lineHeight: 1.75 }}
                                />
                            )}
                        </div>

                        {/* Excerpt */}
                        <div className="glass-card" style={{ padding: "24px" }}>
                            <label style={{ display: "block", fontWeight: 700, fontSize: "0.82rem", marginBottom: "8px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Excerpt <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(card preview summary)</span>
                            </label>
                            <textarea
                                className="input-field"
                                value={form.excerpt}
                                onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
                                placeholder="A short 1–2 sentence description shown in post cards and social previews…"
                                rows={3}
                                style={{ resize: "vertical" }}
                            />
                        </div>
                    </div>

                    {/* ── Right column: Metadata sidebar ──────────── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px", position: "sticky", top: "100px" }}>

                        {/* Publisher */}
                        <div className="glass-card" style={{ padding: "20px" }}>
                            <label style={{ display: "block", fontWeight: 700, fontSize: "0.82rem", marginBottom: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Publisher
                            </label>
                            <select
                                className="input-field"
                                value={form.publisher}
                                onChange={(e) => setForm((prev) => ({ ...prev, publisher: e.target.value }))}
                                style={{ cursor: "pointer" }}
                            >
                                <option value="NOTRESPOND LABS">NOTRESPOND LABS</option>
                                <option value="Security Research">Security Research</option>
                                <option value="Infrastructure">Infrastructure</option>
                                <option value="Community">Community</option>
                            </select>
                        </div>

                        {/* Author */}
                        <div className="glass-card" style={{ padding: "20px" }}>
                            <label style={{ display: "block", fontWeight: 700, fontSize: "0.82rem", marginBottom: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Author
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "rgba(0,240,255,0.05)", borderRadius: "8px", border: "1px solid rgba(0,240,255,0.12)" }}>
                                <div style={{ width: 32, height: 32, borderRadius: "8px", background: "var(--gradient-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.85rem", flexShrink: 0 }}>
                                    A
                                </div>
                                <div>
                                    <p style={{ fontWeight: 700, fontSize: "0.88rem" }}>You (Logged In)</p>
                                    <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Assigned from session</p>
                                </div>
                            </div>
                        </div>

                        {/* Cover Image */}
                        <div className="glass-card" style={{ padding: "20px" }}>
                            <label style={{ display: "block", fontWeight: 700, fontSize: "0.82rem", marginBottom: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Cover Image URL
                            </label>
                            <input
                                className="input-field"
                                value={form.coverImage}
                                onChange={(e) => setForm((prev) => ({ ...prev, coverImage: e.target.value }))}
                                placeholder="https://…/cover.jpg"
                                style={{ fontSize: "0.82rem" }}
                            />
                            {form.coverImage && (
                                <div style={{ marginTop: "10px", borderRadius: "8px", overflow: "hidden", aspectRatio: "16/9", background: "rgba(0,0,0,0.3)" }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={form.coverImage} alt="Cover preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                </div>
                            )}
                        </div>

                        {/* Tags */}
                        <div className="glass-card" style={{ padding: "20px" }}>
                            <label style={{ display: "block", fontWeight: 700, fontSize: "0.82rem", marginBottom: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Tags
                            </label>
                            <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                                <input
                                    className="input-field"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                                    placeholder="Add tag + Enter"
                                    style={{ fontSize: "0.82rem", flex: 1 }}
                                />
                                <button type="button" onClick={addTag} className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: "0.8rem", flexShrink: 0 }}>+</button>
                            </div>
                            {form.tags.length > 0 ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                    {form.tags.map((tag) => (
                                        <TagPill key={tag} tag={tag} onRemove={() => removeTag(tag)} />
                                    ))}
                                </div>
                            ) : (
                                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>No tags added yet.</p>
                            )}
                        </div>

                        {/* Status summary */}
                        <div className="glass-card" style={{ padding: "20px" }}>
                            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>Summary</p>
                            {[
                                ["Words",     wordCount.toString()],
                                ["Read time", `~${readTime} min`],
                                ["Tags",      form.tags.length.toString()],
                                ["Publisher", form.publisher],
                            ].map(([k, v]) => (
                                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.82rem" }}>
                                    <span style={{ color: "var(--text-muted)" }}>{k}</span>
                                    <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{v}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
