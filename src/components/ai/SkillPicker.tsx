"use client";

import { useState, useRef, useEffect } from "react";
import { Wand2, ChevronDown, Check, Settings2, Users } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import type { SkillSummary } from "./types";

/**
 * Attach skills to the current conversation.
 *
 * The selection belongs to the thread, not the composer — a skill stays on
 * until it is turned off, which is what makes it worth writing down instead of
 * re-pasting. Every attached skill applies to whichever model answers, so
 * switching from the local model to Claude carries the same instructions.
 */
export default function SkillPicker({
    skills,
    selected,
    onChange,
    onManage,
    disabled,
}: {
    skills: SkillSummary[];
    selected: string[];
    onChange: (ids: string[]) => void;
    onManage: () => void;
    disabled?: boolean;
}) {
    const t = useThemeTokens();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    const toggle = (id: string) => {
        onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
    };

    const count = selected.length;

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button
                id="ai-skill-picker"
                onClick={() => !disabled && setOpen(o => !o)}
                disabled={disabled}
                title="Attach your own instruction sets to this conversation"
                style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "4px 10px", borderRadius: t.buttonRadius,
                    border: `1px solid ${count ? t.accentPrimary : t.borderPrimary}`,
                    background: count ? t.accentPrimaryMuted : "transparent",
                    color: count ? t.accentPrimary : t.textMuted,
                    fontSize: "0.73rem", fontWeight: 600,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.6 : 1,
                    fontFamily: t.fontFamily,
                }}
            >
                <Wand2 style={{ width: 12, height: 12 }} />
                {count ? `${count} skill${count > 1 ? "s" : ""}` : "Skills"}
                <ChevronDown style={{ width: 11, height: 11, opacity: 0.6 }} />
            </button>

            {open && (
                <div style={{
                    position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 30,
                    width: 320, maxHeight: 340, overflowY: "auto",
                    background: t.bgCard,
                    border: `1px solid ${t.borderPrimary}`,
                    borderRadius: t.cardRadius,
                    boxShadow: t.shadow === "none" ? "0 8px 24px rgba(0,0,0,0.25)" : t.shadow,
                    animation: "aiFadeIn 0.15s ease",
                }}>
                    {skills.length === 0 ? (
                        <p style={{ padding: "14px 16px", fontSize: "0.8rem", lineHeight: 1.5, color: t.textMuted }}>
                            No skills yet. A skill is a named block of instructions —
                            &ldquo;always answer in British English&rdquo;, a house code style, a
                            runbook format — that applies to every model on the thread.
                        </p>
                    ) : (
                        skills.map(skill => {
                            const on = selected.includes(skill.id);
                            return (
                                <button
                                    key={skill.id}
                                    onClick={() => toggle(skill.id)}
                                    style={{
                                        display: "flex", alignItems: "flex-start", gap: 10,
                                        width: "100%", padding: "10px 14px",
                                        border: "none", cursor: "pointer", textAlign: "left",
                                        background: on ? t.accentPrimaryMuted : "transparent",
                                        color: t.textPrimary, fontFamily: t.fontFamily,
                                    }}
                                    onMouseEnter={e => { if (!on) e.currentTarget.style.background = t.bgCardHover; }}
                                    onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}
                                >
                                    <span style={{
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        width: 16, height: 16, flexShrink: 0, marginTop: 2,
                                        borderRadius: 4,
                                        border: `1px solid ${on ? t.accentPrimary : t.borderPrimary}`,
                                        background: on ? t.accentPrimary : "transparent",
                                    }}>
                                        {on && <Check style={{ width: 11, height: 11, color: t.textInverse }} />}
                                    </span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{
                                            display: "flex", alignItems: "center", gap: 6,
                                            fontSize: "0.83rem", fontWeight: 600,
                                        }}>
                                            {skill.name}
                                            {skill.shared && (
                                                <Users style={{ width: 11, height: 11, color: t.textMuted }} />
                                            )}
                                        </span>
                                        {skill.description && (
                                            <span style={{
                                                display: "block", marginTop: 2,
                                                fontSize: "0.73rem", lineHeight: 1.4, color: t.textMuted,
                                            }}>
                                                {skill.description}
                                            </span>
                                        )}
                                        {skill.fileCount > 0 && (
                                            <span style={{ display: "block", marginTop: 2, fontSize: "0.7rem", color: t.textMuted }}>
                                                {skill.fileCount} reference file{skill.fileCount > 1 ? "s" : ""}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })
                    )}

                    <button
                        onClick={() => { setOpen(false); onManage(); }}
                        style={{
                            display: "flex", alignItems: "center", gap: 7,
                            width: "100%", padding: "10px 14px",
                            border: "none", borderTop: `1px solid ${t.borderPrimary}`,
                            background: t.bgSecondary, color: t.textSecondary,
                            fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                            fontFamily: t.fontFamily, textAlign: "left",
                        }}
                    >
                        <Settings2 style={{ width: 13, height: 13 }} />
                        Manage skills
                    </button>
                </div>
            )}
        </div>
    );
}
