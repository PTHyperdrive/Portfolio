"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Cpu, ChevronDown, Lock, Circle, Check, Loader2, AlertTriangle } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import type { AiNodeSummary, NodeModels } from "./types";

/**
 * Node and model selector, grouped by vendor.
 *
 * A node is a *machine*; one machine usually serves several models at once. So
 * the list is two levels: pick the host, then pick what runs on it. The models
 * are fetched from the provider when a node is expanded rather than read from
 * configuration — load another model into LM Studio and it appears here without
 * anyone editing the admin panel.
 *
 * Only nodes the API returned are listed — a user never receives PREMIUM
 * entries at all, so there is nothing here to disable or hide client-side.
 * The PREMIUM badge exists for admins, who see both tiers.
 *
 * Switching model mid-conversation is deliberate, not an edge case: the thread
 * is shared, and each model sees the others' turns attributed to them.
 */
export default function ModelPicker({
    nodes,
    selectedId,
    selectedModelId,
    onSelect,
    disabled,
}: {
    nodes: AiNodeSummary[];
    selectedId: string | null;
    /** Chosen model on that node, or null for the node's default. */
    selectedModelId: string | null;
    onSelect: (nodeId: string, modelId: string | null) => void;
    disabled?: boolean;
}) {
    const t = useThemeTokens();
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [catalog, setCatalog] = useState<Record<string, NodeModels>>({});
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    /** Ask a node what it is serving. Cached per node for the life of the menu. */
    const loadModels = useCallback(async (nodeId: string) => {
        setCatalog(prev => {
            if (prev[nodeId] && !prev[nodeId].error) return prev;
            return {
                ...prev,
                [nodeId]: { models: [], defaultModelId: "", reportsLoadState: false, loading: true },
            };
        });
        try {
            const res = await fetch(`/api/ai/nodes/${nodeId}/models`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not list models");
            setCatalog(prev => ({
                ...prev,
                [nodeId]: {
                    models: data.models,
                    defaultModelId: data.defaultModelId,
                    reportsLoadState: Boolean(data.reportsLoadState),
                    loading: false,
                },
            }));
        } catch (err) {
            setCatalog(prev => ({
                ...prev,
                [nodeId]: {
                    models: [], defaultModelId: "", reportsLoadState: false, loading: false,
                    error: err instanceof Error ? err.message : "Could not list models",
                },
            }));
        }
    }, []);

    const toggleNode = (nodeId: string) => {
        const next = expanded === nodeId ? null : nodeId;
        setExpanded(next);
        if (next) void loadModels(next);
    };

    const selected = nodes.find(n => n.id === selectedId) ?? null;
    const shownModel = selectedModelId || selected?.modelId || "";

    const groups = nodes.reduce<Map<string, AiNodeSummary[]>>((acc, node) => {
        const list = acc.get(node.vendor);
        if (list) list.push(node);
        else acc.set(node.vendor, [node]);
        return acc;
    }, new Map());
    const multiVendor = groups.size > 1;

    /** Strip the vendor prefix LM Studio puts on ids, for a readable label. */
    const short = (id: string) => id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;

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
                <span style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selected ? short(shownModel) || selected.displayName : "No model available"}
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
                    minWidth: 360, maxHeight: 460, overflowY: "auto",
                    background: t.bgCard,
                    border: `1px solid ${t.borderPrimary}`,
                    borderRadius: t.cardRadius,
                    boxShadow: t.shadow === "none" ? "0 8px 24px rgba(0,0,0,0.25)" : t.shadow,
                    animation: "aiFadeIn 0.15s ease",
                }}>
                    {nodes.length === 0 && (
                        <p style={{ padding: "14px 16px", fontSize: "0.82rem", lineHeight: 1.5, color: t.textMuted }}>
                            No inference nodes are available to you. If you expect one here, ask an
                            administrator — a node may be offline or reserved.
                        </p>
                    )}

                    {[...groups].map(([vendor, group]) => (
                        <div key={vendor}>
                            {multiVendor && (
                                <div style={{
                                    padding: "8px 14px 4px",
                                    fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.08em",
                                    color: t.textMuted, textTransform: "uppercase",
                                    background: t.bgSecondary,
                                    borderTop: `1px solid ${t.borderPrimary}`,
                                }}>
                                    {vendor}
                                </div>
                            )}

                            {group.map(node => {
                                const activeNode = node.id === selectedId;
                                const isOpen = expanded === node.id;
                                const entry = catalog[node.id];

                                return (
                                    <div key={node.id}>
                                        <button
                                            onClick={() => toggleNode(node.id)}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 12,
                                                width: "100%", padding: "11px 14px",
                                                border: "none", cursor: "pointer", textAlign: "left",
                                                background: activeNode ? t.accentPrimaryMuted : "transparent",
                                                color: t.textPrimary,
                                                borderLeft: `3px solid ${activeNode ? t.accentPrimary : "transparent"}`,
                                                fontFamily: t.fontFamily,
                                            }}
                                            onMouseEnter={e => { if (!activeNode) e.currentTarget.style.background = t.bgCardHover; }}
                                            onMouseLeave={e => { if (!activeNode) e.currentTarget.style.background = "transparent"; }}
                                        >
                                            <Circle style={{
                                                width: 8, height: 8, flexShrink: 0,
                                                fill: node.online ? t.statusSuccess : t.textMuted,
                                                color: node.online ? t.statusSuccess : t.textMuted,
                                            }} />
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{
                                                    display: "block", fontSize: "0.86rem", fontWeight: 600,
                                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                }}>
                                                    {node.displayName}
                                                </span>
                                                <span style={{ display: "block", fontSize: "0.73rem", color: t.textMuted, marginTop: 2 }}>
                                                    {node.gpuLabel} · {(node.contextLen / 1024).toFixed(0)}k context
                                                    {node.acceptsDocuments && " · PDFs"}
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
                                            <ChevronDown style={{
                                                width: 13, height: 13, flexShrink: 0, opacity: 0.5,
                                                transform: isOpen ? "rotate(180deg)" : "none",
                                                transition: "transform 0.15s",
                                            }} />
                                        </button>

                                        {isOpen && (
                                            <div style={{ background: t.bgSecondary, borderTop: `1px solid ${t.borderPrimary}` }}>
                                                {entry?.loading && (
                                                    <p style={{
                                                        display: "flex", alignItems: "center", gap: 8,
                                                        padding: "10px 16px 10px 34px",
                                                        fontSize: "0.78rem", color: t.textMuted,
                                                    }}>
                                                        <Loader2 style={{ width: 12, height: 12, animation: "aiSpin 0.9s linear infinite" }} />
                                                        Asking {node.displayName} what it is running…
                                                    </p>
                                                )}

                                                {entry?.error && (
                                                    <p style={{
                                                        display: "flex", alignItems: "flex-start", gap: 8,
                                                        padding: "10px 16px 10px 34px",
                                                        fontSize: "0.76rem", lineHeight: 1.5, color: t.statusError,
                                                    }}>
                                                        <AlertTriangle style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2 }} />
                                                        {entry.error}
                                                    </p>
                                                )}

                                                {entry && !entry.loading && !entry.error && entry.models.length === 0 && (
                                                    <p style={{ padding: "10px 16px 10px 34px", fontSize: "0.78rem", color: t.textMuted }}>
                                                        No chat models loaded on this host.
                                                    </p>
                                                )}

                                                {entry?.models.map(model => {
                                                    const chosen = activeNode
                                                        && (selectedModelId ? selectedModelId === model.id : entry.defaultModelId === model.id);
                                                    // Cold models take a minute to load, and the load
                                                    // aborts if the request gives up first — measured at
                                                    // 66s on the RTX pair. Say so before it is picked.
                                                    const cold = entry.reportsLoadState && model.loaded === false;
                                                    return (
                                                        <button
                                                            key={model.id}
                                                            title={cold
                                                                ? "Not loaded — the host loads it first, which can take a minute"
                                                                : undefined}
                                                            onClick={() => {
                                                                onSelect(node.id, model.id);
                                                                setOpen(false);
                                                            }}
                                                            style={{
                                                                display: "flex", alignItems: "center", gap: 9,
                                                                width: "100%", padding: "9px 16px 9px 34px",
                                                                border: "none", cursor: "pointer", textAlign: "left",
                                                                background: chosen ? t.accentPrimaryMuted : "transparent",
                                                                color: chosen ? t.accentPrimary : t.textSecondary,
                                                                fontSize: "0.8rem", fontFamily: t.fontFamily,
                                                                fontWeight: chosen ? 700 : 500,
                                                            }}
                                                            onMouseEnter={e => { if (!chosen) e.currentTarget.style.background = t.bgCardHover; }}
                                                            onMouseLeave={e => { if (!chosen) e.currentTarget.style.background = "transparent"; }}
                                                        >
                                                            <Check style={{
                                                                width: 12, height: 12, flexShrink: 0,
                                                                opacity: chosen ? 1 : 0,
                                                            }} />
                                                            <span style={{
                                                                flex: 1, minWidth: 0, overflow: "hidden",
                                                                textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                            }}>
                                                                {short(model.id)}
                                                            </span>
                                                            {entry.reportsLoadState && (
                                                                <span style={{
                                                                    display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
                                                                    fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.04em",
                                                                    padding: "1px 6px", borderRadius: 20,
                                                                    background: cold ? t.bgTertiary : t.statusSuccessBg,
                                                                    color: cold ? t.textMuted : t.statusSuccess,
                                                                }}>
                                                                    {cold ? "COLD ~1min" : "READY"}
                                                                </span>
                                                            )}
                                                            {model.id === entry.defaultModelId && (
                                                                <span style={{
                                                                    fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.05em",
                                                                    padding: "1px 6px", borderRadius: 20, flexShrink: 0,
                                                                    background: t.bgTertiary, color: t.textMuted,
                                                                }}>
                                                                    DEFAULT
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    {nodes.length > 0 && (
                        <p style={{
                            padding: "9px 14px",
                            borderTop: `1px solid ${t.borderPrimary}`,
                            background: t.bgSecondary,
                            fontSize: "0.7rem", lineHeight: 1.5, color: t.textMuted,
                        }}>
                            Models are read from each host live. A model marked COLD is not
                            resident: the host loads it on first use, which can take a minute.
                            Switching mid-conversation keeps the
                            thread — each model sees the others&rsquo; replies, labelled with who wrote them.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
