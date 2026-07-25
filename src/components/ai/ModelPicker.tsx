"use client";

import { useState, useRef, useEffect } from "react";
import { Cpu, ChevronDown, Lock, Circle } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import type { AiNodeSummary } from "./types";

/**
 * Model selector.
 *
 * Only nodes the API returned are listed — a user never receives PREMIUM
 * entries at all, so there is nothing here to disable or hide client-side.
 * The PREMIUM badge exists for admins, who see both tiers.
 */
export default function ModelPicker({
    nodes,
    selectedId,
    onSelect,
    disabled,
}: {
    nodes: AiNodeSummary[];
    selectedId: string | null;
    onSelect: (id: string) => void;
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

    const selected = nodes.find(n => n.id === selectedId) ?? null;

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button
                id="ai-model-picker"
                onClick={() => !disabled && setOpen(o => !o)}
                disabled={disabled}
                style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px",
                    borderRadius: t.buttonRadius,
                    border: `1px solid ${t.borderPrimary}`,
                    background: t.bgCard,
                    color: t.textPrimary,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.6 : 1,
                    fontSize: "0.85rem", fontWeight: 600,
                    fontFamily: t.fontFamily,
                    transition: "border-color 0.15s",
                }}
            >
                <Cpu style={{ width: 15, height: 15, color: t.accentPrimary, flexShrink: 0 }} />
                <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selected ? selected.displayName : "No model available"}
                </span>
                {selected && (
                    <span style={{
                        fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.04em",
                        padding: "1px 7px", borderRadius: 20,
                        background: t.bgTertiary, color: t.textSecondary,
                    }}>
                        {selected.gpuLabel}
                    </span>
                )}
                <ChevronDown style={{ width: 14, height: 14, opacity: 0.5, flexShrink: 0 }} />
            </button>

            {open && (
                <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 30,
                    minWidth: 320,
                    background: t.bgCard,
                    border: `1px solid ${t.borderPrimary}`,
                    borderRadius: t.cardRadius,
                    boxShadow: t.shadow === "none" ? "0 8px 24px rgba(0,0,0,0.25)" : t.shadow,
                    overflow: "hidden",
                    animation: "aiFadeIn 0.15s ease",
                }}>
                    {nodes.length === 0 && (
                        <p style={{ padding: "14px 16px", fontSize: "0.82rem", color: t.textMuted }}>
                            No inference nodes are online.
                        </p>
                    )}

                    {nodes.map(node => {
                        const active = node.id === selectedId;
                        return (
                            <button
                                key={node.id}
                                onClick={() => { onSelect(node.id); setOpen(false); }}
                                style={{
                                    display: "flex", alignItems: "center", gap: 12,
                                    width: "100%", padding: "11px 14px",
                                    border: "none", cursor: "pointer", textAlign: "left",
                                    background: active ? t.accentPrimaryMuted : "transparent",
                                    color: t.textPrimary,
                                    borderLeft: `3px solid ${active ? t.accentPrimary : "transparent"}`,
                                    fontFamily: t.fontFamily,
                                    transition: "background 0.15s",
                                }}
                                onMouseEnter={e => { if (!active) e.currentTarget.style.background = t.bgCardHover; }}
                                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                            >
                                <Circle
                                    style={{
                                        width: 8, height: 8, flexShrink: 0,
                                        fill: node.online ? t.statusSuccess : t.textMuted,
                                        color: node.online ? t.statusSuccess : t.textMuted,
                                    }}
                                />
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{
                                        display: "block", fontSize: "0.86rem", fontWeight: 600,
                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                        {node.displayName}
                                    </span>
                                    <span style={{ display: "block", fontSize: "0.73rem", color: t.textMuted, marginTop: 2 }}>
                                        {node.gpuLabel} · {(node.contextLen / 1024).toFixed(0)}k context
                                        {!node.online && " · offline"}
                                    </span>
                                </span>
                                {node.tier === "PREMIUM" && (
                                    <span style={{
                                        display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
                                        fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.06em",
                                        padding: "2px 7px", borderRadius: 20,
                                        background: t.statusWarningBg, color: t.statusWarning,
                                    }}>
                                        <Lock style={{ width: 9, height: 9 }} />
                                        ADMIN
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
