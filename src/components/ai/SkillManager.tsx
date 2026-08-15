"use client";

import { useState, useEffect, useCallback } from "react";
import {
    X, Plus, Trash2, Save, Wand2, Users, FileText, AlertTriangle, Paperclip,
} from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useIsMobile } from "@/lib/useIsMobile";
import type { SkillSummary } from "./types";

interface SkillFile {
    filename: string;
    mimeType: string;
    content: string;
}

interface SkillDraft {
    id: string | null;
    name: string;
    description: string;
    instructions: string;
    shared: boolean;
    files: SkillFile[];
}

const EMPTY: SkillDraft = {
    id: null, name: "", description: "", instructions: "", shared: false, files: [],
};

const PLACEHOLDER =
    "Write the instructions as you would explain them to a colleague.\n\n" +
    "Example:\n" +
    "When I ask for infrastructure changes, always give me the exact command,\n" +
    "state which host to run it on, and say what to check afterwards to confirm\n" +
    "it worked. Never suggest a change that cannot be rolled back without saying so.";

/**
 * Create and edit skills.
 *
 * Reference files are read in the browser and posted as text — the API
 * re-validates them with the same ingest code the chat upload uses, so a file
 * that would be rejected in chat cannot get in through here either.
 */
export default function SkillManager({
    onClose,
    onChanged,
    isAdmin,
}: {
    onClose: () => void;
    onChanged: () => void;
    isAdmin: boolean;
}) {
    const t = useThemeTokens();
    const isMobile = useIsMobile();

    const [skills, setSkills] = useState<SkillSummary[]>([]);
    const [draft, setDraft] = useState<SkillDraft>(EMPTY);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/ai/skills");
            if (!res.ok) throw new Error();
            const data = await res.json();
            setSkills(data.skills);
        } catch {
            setError("Could not load skills.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const edit = async (id: string) => {
        setError(null);
        try {
            const res = await fetch(`/api/ai/skills/${id}`);
            if (!res.ok) throw new Error();
            const { skill } = await res.json();
            setDraft({
                id: skill.id,
                name: skill.name,
                description: skill.description ?? "",
                instructions: skill.instructions,
                shared: skill.shared,
                files: skill.files.map((f: SkillFile) => ({
                    filename: f.filename, mimeType: f.mimeType, content: f.content,
                })),
            });
        } catch {
            setError("Could not open that skill.");
        }
    };

    const save = async () => {
        if (!draft.name.trim() || !draft.instructions.trim()) {
            setError("A skill needs a name and instructions.");
            return;
        }
        setBusy(true);
        setError(null);

        const body = {
            name: draft.name.trim(),
            description: draft.description.trim() || undefined,
            instructions: draft.instructions.trim(),
            shared: draft.shared,
            files: draft.files,
        };

        try {
            const res = await fetch(
                draft.id ? `/api/ai/skills/${draft.id}` : "/api/ai/skills",
                {
                    method: draft.id ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                },
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Could not save the skill.");
            setDraft(EMPTY);
            await load();
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save the skill.");
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: string) => {
        setBusy(true);
        try {
            const res = await fetch(`/api/ai/skills/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
            if (draft.id === id) setDraft(EMPTY);
            await load();
            onChanged();
        } catch {
            setError("Could not delete that skill.");
        } finally {
            setBusy(false);
        }
    };

    /** Read picked files as text. Binary formats fail here, before the API. */
    const addFiles = async (list: FileList | null) => {
        if (!list?.length) return;
        const next: SkillFile[] = [];

        for (const file of Array.from(list).slice(0, 10)) {
            if (file.size > 400_000) {
                setError(`${file.name} is larger than 400 KB — reference files must be small enough to sit in the prompt.`);
                continue;
            }
            const content = await file.text();
            // A NUL byte means this was never text, whatever the extension says.
            if (content.includes("\u0000")) {
                setError(`${file.name} is not a text file.`);
                continue;
            }
            next.push({ filename: file.name, mimeType: file.type || "text/plain", content });
        }

        if (next.length) {
            setDraft(d => ({ ...d, files: [...d.files, ...next].slice(0, 10) }));
        }
    };

    const field: React.CSSProperties = {
        width: "100%", padding: "9px 11px",
        borderRadius: t.buttonRadius,
        border: `1px solid ${t.borderPrimary}`,
        background: t.bgInput, color: t.textPrimary,
        fontSize: "0.85rem", fontFamily: t.fontFamily, outline: "none",
    };

    const label: React.CSSProperties = {
        display: "block", marginBottom: 5,
        fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.03em",
        color: t.textMuted, textTransform: "uppercase",
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 200,
                background: "rgba(0,0,0,0.55)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: isMobile ? 0 : 24,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    display: "flex", flexDirection: isMobile ? "column" : "row",
                    width: "100%", maxWidth: 980,
                    height: isMobile ? "100dvh" : "min(86vh, 700px)",
                    background: t.bgCard,
                    border: `1px solid ${t.borderPrimary}`,
                    borderRadius: isMobile ? 0 : t.cardRadius,
                    overflow: "hidden", fontFamily: t.fontFamily,
                }}
            >
                {/* ── List ── */}
                <div style={{
                    width: isMobile ? "100%" : 300, flexShrink: 0,
                    display: "flex", flexDirection: "column",
                    borderRight: isMobile ? "none" : `1px solid ${t.borderPrimary}`,
                    borderBottom: isMobile ? `1px solid ${t.borderPrimary}` : "none",
                    background: t.bgSecondary,
                    maxHeight: isMobile ? "38%" : "none",
                }}>
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 16px", borderBottom: `1px solid ${t.borderPrimary}`,
                    }}>
                        <span style={{
                            display: "inline-flex", alignItems: "center", gap: 8,
                            fontSize: "0.9rem", fontWeight: 800, color: t.textPrimary,
                        }}>
                            <Wand2 style={{ width: 15, height: 15, color: t.accentPrimary }} />
                            Skills
                        </span>
                        <button
                            onClick={() => { setDraft(EMPTY); setError(null); }}
                            title="New skill"
                            aria-label="New skill"
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 28, height: 28, borderRadius: t.buttonRadius,
                                border: `1px solid ${t.borderPrimary}`,
                                background: "transparent", color: t.textSecondary, cursor: "pointer",
                            }}
                        >
                            <Plus style={{ width: 14, height: 14 }} />
                        </button>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto" }}>
                        {loading && (
                            <p style={{ padding: "14px 16px", fontSize: "0.8rem", color: t.textMuted }}>
                                Loading…
                            </p>
                        )}
                        {!loading && skills.length === 0 && (
                            <p style={{ padding: "14px 16px", fontSize: "0.8rem", lineHeight: 1.5, color: t.textMuted }}>
                                No skills yet. Create one on the right.
                            </p>
                        )}
                        {skills.map(s => (
                            <div
                                key={s.id}
                                style={{
                                    display: "flex", alignItems: "center", gap: 6,
                                    padding: "10px 10px 10px 14px",
                                    background: draft.id === s.id ? t.accentPrimaryMuted : "transparent",
                                    borderLeft: `3px solid ${draft.id === s.id ? t.accentPrimary : "transparent"}`,
                                }}
                            >
                                <button
                                    onClick={() => s.owned && void edit(s.id)}
                                    disabled={!s.owned}
                                    style={{
                                        flex: 1, minWidth: 0, textAlign: "left",
                                        border: "none", background: "transparent", padding: 0,
                                        cursor: s.owned ? "pointer" : "default",
                                        fontFamily: t.fontFamily,
                                    }}
                                >
                                    <span style={{
                                        display: "flex", alignItems: "center", gap: 6,
                                        fontSize: "0.83rem", fontWeight: 600, color: t.textPrimary,
                                    }}>
                                        {s.name}
                                        {s.shared && <Users style={{ width: 11, height: 11, color: t.textMuted }} />}
                                    </span>
                                    <span style={{
                                        display: "block", marginTop: 2,
                                        fontSize: "0.72rem", color: t.textMuted,
                                    }}>
                                        {s.owned ? "Yours" : "Shared with you"}
                                        {s.fileCount > 0 && ` · ${s.fileCount} file${s.fileCount > 1 ? "s" : ""}`}
                                    </span>
                                </button>
                                {s.owned && (
                                    <button
                                        onClick={() => void remove(s.id)}
                                        disabled={busy}
                                        aria-label={`Delete ${s.name}`}
                                        style={{
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            width: 26, height: 26, flexShrink: 0,
                                            border: "none", background: "transparent",
                                            color: t.textMuted, cursor: "pointer",
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.color = t.statusError; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; }}
                                    >
                                        <Trash2 style={{ width: 13, height: 13 }} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Editor ── */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 18px", borderBottom: `1px solid ${t.borderPrimary}`,
                    }}>
                        <span style={{ fontSize: "0.88rem", fontWeight: 700, color: t.textPrimary }}>
                            {draft.id ? "Edit skill" : "New skill"}
                        </span>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 28, height: 28, borderRadius: t.buttonRadius,
                                border: "none", background: "transparent",
                                color: t.textMuted, cursor: "pointer",
                            }}
                        >
                            <X style={{ width: 16, height: 16 }} />
                        </button>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
                        {error && (
                            <div style={{
                                display: "flex", alignItems: "flex-start", gap: 9,
                                padding: "10px 12px", marginBottom: 14,
                                borderRadius: t.cardRadius,
                                border: `1px solid ${t.statusError}40`,
                                background: t.statusErrorBg, color: t.statusError,
                                fontSize: "0.8rem", lineHeight: 1.5,
                            }}>
                                <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                                {error}
                            </div>
                        )}

                        <div style={{ marginBottom: 14 }}>
                            <label style={label} htmlFor="skill-name">Name</label>
                            <input
                                id="skill-name"
                                value={draft.name}
                                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                                placeholder="House code style"
                                maxLength={80}
                                style={field}
                            />
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={label} htmlFor="skill-desc">Description</label>
                            <input
                                id="skill-desc"
                                value={draft.description}
                                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                                placeholder="One line, shown in the picker"
                                maxLength={300}
                                style={field}
                            />
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={label} htmlFor="skill-instructions">Instructions</label>
                            <textarea
                                id="skill-instructions"
                                value={draft.instructions}
                                onChange={e => setDraft(d => ({ ...d, instructions: e.target.value }))}
                                placeholder={PLACEHOLDER}
                                rows={12}
                                style={{ ...field, resize: "vertical", lineHeight: 1.6, minHeight: 180 }}
                            />
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={label}>Reference files</label>
                            {draft.files.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                                    {draft.files.map((f, i) => (
                                        <span key={`${f.filename}-${i}`} style={{
                                            display: "flex", alignItems: "center", gap: 8,
                                            padding: "7px 10px", borderRadius: t.buttonRadius,
                                            border: `1px solid ${t.borderPrimary}`,
                                            background: t.bgSecondary,
                                            fontSize: "0.78rem", color: t.textSecondary,
                                        }}>
                                            <FileText style={{ width: 13, height: 13, flexShrink: 0, color: t.textMuted }} />
                                            <span style={{
                                                flex: 1, minWidth: 0, overflow: "hidden",
                                                textOverflow: "ellipsis", whiteSpace: "nowrap",
                                            }}>
                                                {f.filename}
                                            </span>
                                            <span style={{ fontSize: "0.7rem", color: t.textMuted, flexShrink: 0 }}>
                                                {(f.content.length / 1024).toFixed(1)} KB
                                            </span>
                                            <button
                                                onClick={() => setDraft(d => ({
                                                    ...d, files: d.files.filter((_, j) => j !== i),
                                                }))}
                                                aria-label={`Remove ${f.filename}`}
                                                style={{
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    width: 20, height: 20, flexShrink: 0,
                                                    border: "none", background: "transparent",
                                                    color: t.textMuted, cursor: "pointer", padding: 0,
                                                }}
                                            >
                                                <X style={{ width: 12, height: 12 }} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <label
                                htmlFor="skill-files"
                                style={{
                                    display: "inline-flex", alignItems: "center", gap: 7,
                                    padding: "7px 12px", borderRadius: t.buttonRadius,
                                    border: `1px dashed ${t.borderPrimary}`,
                                    background: "transparent", color: t.textSecondary,
                                    fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                                }}
                            >
                                <Paperclip style={{ width: 13, height: 13 }} />
                                Add text files
                            </label>
                            <input
                                id="skill-files"
                                type="file"
                                multiple
                                onChange={e => { void addFiles(e.target.files); e.target.value = ""; }}
                                style={{ display: "none" }}
                            />
                            <p style={{ marginTop: 6, fontSize: "0.72rem", lineHeight: 1.5, color: t.textMuted }}>
                                Text only, 400 KB each — they are composed into the prompt, so they
                                have to fit in the context window alongside your conversation.
                            </p>
                        </div>

                        {isAdmin && (
                            <label style={{
                                display: "flex", alignItems: "flex-start", gap: 9,
                                padding: "10px 12px", borderRadius: t.cardRadius,
                                border: `1px solid ${t.borderPrimary}`,
                                background: t.bgSecondary, cursor: "pointer",
                            }}>
                                <input
                                    type="checkbox"
                                    checked={draft.shared}
                                    onChange={e => setDraft(d => ({ ...d, shared: e.target.checked }))}
                                    style={{ marginTop: 2, accentColor: t.accentPrimary }}
                                />
                                <span>
                                    <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: t.textPrimary }}>
                                        Share with all users
                                    </span>
                                    <span style={{ display: "block", marginTop: 2, fontSize: "0.73rem", lineHeight: 1.5, color: t.textMuted }}>
                                        Every user will be able to attach this to their own conversations.
                                    </span>
                                </span>
                            </label>
                        )}
                    </div>

                    <div style={{
                        display: "flex", justifyContent: "flex-end", gap: 8,
                        padding: "12px 18px", borderTop: `1px solid ${t.borderPrimary}`,
                        background: t.bgSecondary,
                    }}>
                        {draft.id && (
                            <button
                                onClick={() => { setDraft(EMPTY); setError(null); }}
                                style={{
                                    padding: "8px 14px", borderRadius: t.buttonRadius,
                                    border: `1px solid ${t.borderPrimary}`,
                                    background: "transparent", color: t.textSecondary,
                                    fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                                    fontFamily: t.fontFamily,
                                }}
                            >
                                Cancel
                            </button>
                        )}
                        <button
                            onClick={() => void save()}
                            disabled={busy}
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 7,
                                padding: "8px 16px", borderRadius: t.buttonRadius,
                                border: "none", background: t.accentPrimary, color: t.textInverse,
                                fontSize: "0.8rem", fontWeight: 700,
                                cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1,
                                fontFamily: t.fontFamily,
                            }}
                        >
                            <Save style={{ width: 13, height: 13 }} />
                            {draft.id ? "Save changes" : "Create skill"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
