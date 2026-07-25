"use client";

import { useState } from "react";
import { Plus, MessageSquare, Trash2, Bot } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import type { ConversationSummary } from "./types";

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

export default function ConversationSidebar({
    conversations,
    activeId,
    onSelect,
    onCreate,
    onDelete,
    busy,
}: {
    conversations: ConversationSummary[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onCreate: () => void;
    onDelete: (id: string) => void;
    busy?: boolean;
}) {
    const t = useThemeTokens();
    const [hovered, setHovered] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<string | null>(null);

    return (
        <aside style={{
            width: 280, minWidth: 280, height: "100%",
            display: "flex", flexDirection: "column",
            background: t.bgSecondary,
            borderRight: `1px solid ${t.borderPrimary}`,
            fontFamily: t.fontFamily,
        }}>
            <div style={{ padding: "18px 16px 12px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: t.cardRadius,
                        background: t.accentPrimaryMuted,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                        <Bot style={{ width: 17, height: 17, color: t.accentPrimary }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "1rem", color: t.textPrimary, letterSpacing: "-0.01em" }}>
                        AI Studio
                    </span>
                </div>

                <button
                    id="ai-new-chat"
                    onClick={onCreate}
                    disabled={busy}
                    style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        width: "100%", padding: "10px 12px",
                        borderRadius: t.buttonRadius,
                        border: `1px solid ${t.borderPrimary}`,
                        background: t.accentPrimary,
                        color: t.textInverse,
                        fontSize: "0.86rem", fontWeight: 700,
                        cursor: busy ? "wait" : "pointer",
                        fontFamily: t.fontFamily,
                        transition: "transform 0.15s, filter 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
                    onMouseDown={e => { e.currentTarget.style.transform = "scale(0.98)"; }}
                    onMouseUp={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                >
                    <Plus style={{ width: 16, height: 16 }} />
                    New chat
                </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px 16px", scrollbarWidth: "none" }}>
                {conversations.length === 0 && (
                    <p style={{ padding: "18px 8px", fontSize: "0.8rem", color: t.textMuted, lineHeight: 1.6 }}>
                        No conversations yet. Start one to see it here.
                    </p>
                )}

                {conversations.map(c => {
                    const active = c.id === activeId;
                    const isHovered = hovered === c.id;
                    return (
                        <div
                            key={c.id}
                            onMouseEnter={() => setHovered(c.id)}
                            onMouseLeave={() => { setHovered(null); setConfirming(null); }}
                            style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "9px 10px", marginBottom: 2,
                                borderRadius: t.cardRadius,
                                cursor: "pointer",
                                borderLeft: `3px solid ${active ? t.accentPrimary : "transparent"}`,
                                background: active ? t.accentPrimaryMuted : isHovered ? t.bgCardHover : "transparent",
                                transition: "background 0.15s",
                            }}
                            onClick={() => onSelect(c.id)}
                        >
                            <MessageSquare style={{
                                width: 15, height: 15, flexShrink: 0,
                                color: active ? t.accentPrimary : t.textMuted,
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                    fontSize: "0.83rem", fontWeight: 600, lineHeight: 1.35,
                                    color: active ? t.textPrimary : t.textSecondary,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                    {c.title}
                                </p>
                                <p style={{ fontSize: "0.7rem", color: t.textMuted, marginTop: 1 }}>
                                    {relativeTime(c.updatedAt)}
                                </p>
                            </div>

                            {(isHovered || confirming === c.id) && (
                                <button
                                    aria-label={confirming === c.id ? "Confirm delete" : "Delete conversation"}
                                    onClick={e => {
                                        e.stopPropagation();
                                        if (confirming === c.id) { onDelete(c.id); setConfirming(null); }
                                        else setConfirming(c.id);
                                    }}
                                    style={{
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        width: 26, height: 26, flexShrink: 0,
                                        border: confirming === c.id ? `1px solid ${t.statusError}` : "none",
                                        borderRadius: t.buttonRadius,
                                        background: confirming === c.id ? t.statusErrorBg : "transparent",
                                        color: confirming === c.id ? t.statusError : t.textMuted,
                                        cursor: "pointer",
                                    }}
                                >
                                    <Trash2 style={{ width: 13, height: 13 }} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
