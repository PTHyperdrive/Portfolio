"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    Send, Square, Copy, Check, Bot, User as UserIcon,
    AlertTriangle, Sparkles, Zap, History, Brain,
} from "lucide-react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useIsMobile } from "@/lib/useIsMobile";
import ModelPicker from "./ModelPicker";
import type { AiNodeSummary, ChatMessage } from "./types";

const SUGGESTIONS = [
    "Explain PCIe passthrough in one paragraph",
    "Write a bash script to rotate nginx logs",
    "Summarise the tradeoffs of ZFS vs LVM-thin",
    "Draft a status page incident update",
];

export default function AiChatView({
    activeId,
    onConversationsChanged,
    onActiveChange,
    onOpenHistory,
}: {
    activeId: string | null;
    onConversationsChanged: () => void;
    onActiveChange: (id: string) => void;
    /** Mobile only — opens the conversation list overlay. */
    onOpenHistory?: () => void;
}) {
    const t = useThemeTokens();
    const isMobile = useIsMobile();

    const [nodes, setNodes] = useState<AiNodeSummary[]>([]);
    const [nodeId, setNodeId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
    const [loadingThread, setLoadingThread] = useState(false);

    const abortRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const pinnedToBottom = useRef(true);

    /* ── Load available nodes once ─────────────────────────────── */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/ai/nodes");
                if (!res.ok) throw new Error("Failed to load models");
                const data = await res.json();
                if (cancelled) return;
                setNodes(data.nodes);
                setNodeId(prev => prev ?? data.nodes.find((n: AiNodeSummary) => n.online)?.id ?? data.nodes[0]?.id ?? null);
            } catch {
                if (!cancelled) setError("Could not reach the inference cluster.");
            }
        })();
        return () => { cancelled = true; };
    }, []);

    /* ── Load transcript when the active thread changes ─────────── */
    useEffect(() => {
        if (!activeId) { setMessages([]); return; }
        let cancelled = false;
        setLoadingThread(true);
        (async () => {
            try {
                const res = await fetch(`/api/ai/conversations/${activeId}`);
                if (!res.ok) throw new Error();
                const data = await res.json();
                if (cancelled) return;
                setMessages(data.conversation.messages);
                if (data.conversation.nodeId) setNodeId(data.conversation.nodeId);
            } catch {
                if (!cancelled) setError("Could not load that conversation.");
            } finally {
                if (!cancelled) setLoadingThread(false);
            }
        })();
        return () => { cancelled = true; };
    }, [activeId]);

    /* ── Keep the view pinned to the newest token ───────────────── */
    useEffect(() => {
        if (!pinnedToBottom.current) return;
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [messages]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };

    /* ── Composer autosize ─────────────────────────────────────── */
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, [input]);

    const stop = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setStreaming(false);
        setMessages(prev => prev.map(m => ({ ...m, streaming: false })));
    }, []);

    /* ── Send ──────────────────────────────────────────────────── */
    const send = useCallback(async (text: string) => {
        const content = text.trim();
        if (!content || streaming) return;

        setError(null);
        setInput("");
        pinnedToBottom.current = true;

        // Make sure a thread exists before streaming into it.
        let threadId = activeId;
        if (!threadId) {
            try {
                const res = await fetch("/api/ai/conversations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nodeId }),
                });
                if (!res.ok) throw new Error((await res.json()).error ?? "Failed to start chat");
                const data = await res.json();
                threadId = data.conversation.id;
                onActiveChange(data.conversation.id);
                onConversationsChanged();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to start chat");
                return;
            }
        }

        const localId = `local-${Date.now()}`;
        setMessages(prev => [
            ...prev,
            { id: localId, role: "user", content },
            { id: `${localId}-a`, role: "assistant", content: "", streaming: true },
        ]);
        setStreaming(true);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId: threadId, content, nodeId }),
                signal: controller.signal,
            });

            if (!res.ok || !res.body) {
                const detail = await res.json().catch(() => ({}));
                throw new Error(detail.error ?? `Request failed (${res.status})`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const blocks = buffer.split("\n\n");
                buffer = blocks.pop() ?? "";

                for (const block of blocks) {
                    const evLine = block.split("\n").find(l => l.startsWith("event:"));
                    const dataLine = block.split("\n").find(l => l.startsWith("data:"));
                    if (!evLine || !dataLine) continue;

                    const event = evLine.slice(6).trim();
                    let payload: Record<string, unknown>;
                    try { payload = JSON.parse(dataLine.slice(5).trim()); }
                    catch { continue; }

                    if (event === "meta") {
                        setMessages(prev => prev.map(m =>
                            m.id === `${localId}-a`
                                ? { ...m, gpuLabel: payload.gpuLabel as string, modelId: payload.model as string }
                                : m));
                    } else if (event === "reasoning") {
                        const chunk = payload.text as string;
                        setMessages(prev => prev.map(m =>
                            m.id === `${localId}-a`
                                ? { ...m, reasoning: (m.reasoning ?? "") + chunk }
                                : m));
                    } else if (event === "delta") {
                        const chunk = payload.text as string;
                        setMessages(prev => prev.map(m =>
                            m.id === `${localId}-a` ? { ...m, content: m.content + chunk } : m));
                    } else if (event === "done") {
                        setMessages(prev => prev.map(m =>
                            m.id === `${localId}-a`
                                ? {
                                    ...m,
                                    streaming: false,
                                    latencyMs: payload.latencyMs as number,
                                    outputTokens: payload.outputTokens as number,
                                }
                                : m));
                    } else if (event === "error") {
                        throw new Error((payload.message as string) || "Generation failed");
                    }
                }
            }
            onConversationsChanged();
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
                // User pressed stop — partial text stays on screen.
            } else {
                setError(err instanceof Error ? err.message : "Generation failed");
                setMessages(prev => prev.filter(m => m.id !== `${localId}-a` || m.content.length > 0));
            }
        } finally {
            abortRef.current = null;
            setStreaming(false);
            setMessages(prev => prev.map(m => ({ ...m, streaming: false })));
        }
    }, [activeId, nodeId, streaming, onActiveChange, onConversationsChanged]);

    const copy = async (msg: ChatMessage) => {
        await navigator.clipboard.writeText(msg.content);
        setCopiedId(msg.id);
        setTimeout(() => setCopiedId(null), 1600);
    };

    const selectedNode = nodes.find(n => n.id === nodeId) ?? null;
    const showWelcome = messages.length === 0 && !loadingThread;

    return (
        <div style={{
            display: "flex", flexDirection: "column",
            height: isMobile ? "calc(100dvh - 59px)" : "100dvh",
            background: t.bgPrimary, fontFamily: t.fontFamily,
        }}>
            {/* ── Header ── */}
            <header style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, padding: isMobile ? "10px 14px" : "14px 24px",
                borderBottom: `1px solid ${t.borderPrimary}`,
                background: t.bgSecondary, flexShrink: 0,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {isMobile && onOpenHistory && (
                        <button
                            onClick={onOpenHistory}
                            aria-label="Conversation history"
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 36, height: 36, flexShrink: 0,
                                borderRadius: t.buttonRadius,
                                border: `1px solid ${t.borderPrimary}`,
                                background: "transparent", color: t.textSecondary, cursor: "pointer",
                            }}
                        >
                            <History style={{ width: 17, height: 17 }} />
                        </button>
                    )}
                    <ModelPicker nodes={nodes} selectedId={nodeId} onSelect={setNodeId} disabled={streaming} />
                </div>
                {selectedNode && !isMobile && (
                    <span style={{
                        display: "flex", alignItems: "center", gap: 6,
                        fontSize: "0.75rem", color: t.textMuted,
                    }}>
                        <Zap style={{ width: 12, height: 12 }} />
                        {selectedNode.online ? "Ready" : "Node offline"}
                    </span>
                )}
            </header>

            {/* ── Transcript ── */}
            <div
                ref={scrollRef}
                onScroll={onScroll}
                style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px 14px" : "28px 24px" }}
            >
                <div style={{ maxWidth: 820, margin: "0 auto" }}>
                    {showWelcome && (
                        <div style={{ textAlign: "center", paddingTop: isMobile ? 40 : 90 }}>
                            <div style={{
                                width: 52, height: 52, borderRadius: t.cardRadius,
                                background: t.accentPrimaryMuted, margin: "0 auto 18px",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                <Sparkles style={{ width: 26, height: 26, color: t.accentPrimary }} />
                            </div>
                            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: t.textPrimary, marginBottom: 8 }}>
                                What can I help with?
                            </h2>
                            <p style={{ fontSize: "0.86rem", color: t.textMuted, marginBottom: 30 }}>
                                {selectedNode
                                    ? `Running ${selectedNode.displayName} on ${selectedNode.gpuLabel}.`
                                    : "No inference node is available right now."}
                            </p>

                            <div style={{
                                display: "grid",
                                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))",
                                gap: 10, textAlign: "left",
                            }}>
                                {SUGGESTIONS.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => send(s)}
                                        disabled={!selectedNode}
                                        style={{
                                            padding: "13px 15px",
                                            borderRadius: t.cardRadius,
                                            border: `1px solid ${t.borderPrimary}`,
                                            background: t.bgCard, color: t.textSecondary,
                                            fontSize: "0.83rem", textAlign: "left",
                                            cursor: selectedNode ? "pointer" : "not-allowed",
                                            fontFamily: t.fontFamily,
                                            transition: "border-color 0.15s, transform 0.15s",
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.borderColor = t.accentPrimary;
                                            e.currentTarget.style.transform = "translateY(-1px)";
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.borderColor = t.borderPrimary;
                                            e.currentTarget.style.transform = "translateY(0)";
                                        }}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map(msg => {
                        const mine = msg.role === "user";
                        return (
                            <div key={msg.id} style={{ display: "flex", gap: 14, marginBottom: 26 }}>
                                <div style={{
                                    width: 30, height: 30, flexShrink: 0,
                                    borderRadius: t.isMono ? 0 : "50%",
                                    background: mine ? t.bgTertiary : t.accentPrimaryMuted,
                                    border: `1px solid ${t.borderPrimary}`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                    {mine
                                        ? <UserIcon style={{ width: 15, height: 15, color: t.textSecondary }} />
                                        : <Bot style={{ width: 15, height: 15, color: t.accentPrimary }} />}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: t.textPrimary }}>
                                            {mine ? "You" : "Assistant"}
                                        </span>
                                        {!mine && msg.gpuLabel && (
                                            <span style={{
                                                fontSize: "0.63rem", fontWeight: 700, letterSpacing: "0.04em",
                                                padding: "1px 6px", borderRadius: 20,
                                                background: t.bgTertiary, color: t.textMuted,
                                            }}>
                                                {msg.gpuLabel}
                                            </span>
                                        )}
                                        {!mine && !msg.streaming && msg.latencyMs != null && (
                                            <span style={{ fontSize: "0.68rem", color: t.textMuted }}>
                                                {(msg.latencyMs / 1000).toFixed(1)}s
                                                {msg.outputTokens ? ` · ${msg.outputTokens} tok` : ""}
                                            </span>
                                        )}
                                    </div>

                                    {mine ? (
                                        <p style={{
                                            fontSize: "0.9rem", lineHeight: 1.7, color: t.textSecondary,
                                            whiteSpace: "pre-wrap", wordBreak: "break-word",
                                        }}>
                                            {msg.content}
                                        </p>
                                    ) : (
                                        <div style={{ fontSize: "0.9rem", lineHeight: 1.7, color: t.textSecondary }}>
                                            {msg.reasoning && (() => {
                                                const thinking = msg.streaming && !msg.content;
                                                const open = thinking || openReasoning.has(msg.id);
                                                return (
                                                    <div style={{ marginBottom: msg.content ? 12 : 0 }}>
                                                        <button
                                                            onClick={() => setOpenReasoning(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(msg.id)) next.delete(msg.id);
                                                                else next.add(msg.id);
                                                                return next;
                                                            })}
                                                            disabled={thinking}
                                                            style={{
                                                                display: "inline-flex", alignItems: "center", gap: 6,
                                                                padding: 0, border: "none", background: "transparent",
                                                                color: t.textMuted, fontSize: "0.75rem", fontWeight: 600,
                                                                cursor: thinking ? "default" : "pointer",
                                                                fontFamily: t.fontFamily, marginBottom: 6,
                                                            }}
                                                        >
                                                            <Brain style={{ width: 12, height: 12 }} />
                                                            {thinking ? "Thinking…" : open ? "Hide reasoning" : "Show reasoning"}
                                                        </button>
                                                        {open && (
                                                            <div style={{
                                                                borderLeft: `2px solid ${t.borderPrimary}`,
                                                                paddingLeft: 12,
                                                                fontSize: "0.8rem", lineHeight: 1.6,
                                                                color: t.textMuted, whiteSpace: "pre-wrap",
                                                                maxHeight: thinking ? 160 : 320, overflowY: "auto",
                                                            }}>
                                                                {msg.reasoning}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            <MarkdownRenderer content={msg.content} />
                                            {msg.streaming && (
                                                <span style={{
                                                    display: "inline-block", width: 7, height: 15,
                                                    background: t.accentPrimary, marginLeft: 2,
                                                    verticalAlign: "text-bottom",
                                                    animation: "aiBlink 1s steps(2) infinite",
                                                }} />
                                            )}
                                        </div>
                                    )}

                                    {!mine && !msg.streaming && msg.content && (
                                        <button
                                            onClick={() => copy(msg)}
                                            aria-label="Copy reply"
                                            style={{
                                                display: "inline-flex", alignItems: "center", gap: 5,
                                                marginTop: 10, padding: "4px 9px",
                                                borderRadius: t.buttonRadius,
                                                border: `1px solid ${t.borderPrimary}`,
                                                background: "transparent", color: t.textMuted,
                                                fontSize: "0.72rem", fontWeight: 600, cursor: "pointer",
                                                fontFamily: t.fontFamily, transition: "color 0.15s",
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.color = t.textPrimary; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; }}
                                        >
                                            {copiedId === msg.id
                                                ? <><Check style={{ width: 11, height: 11 }} /> Copied</>
                                                : <><Copy style={{ width: 11, height: 11 }} /> Copy</>}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {error && (
                        <div style={{
                            display: "flex", alignItems: "flex-start", gap: 10,
                            padding: "12px 14px", marginBottom: 20,
                            borderRadius: t.cardRadius,
                            border: `1px solid ${t.statusError}40`,
                            background: t.statusErrorBg, color: t.statusError,
                            fontSize: "0.82rem", lineHeight: 1.5,
                        }}>
                            <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
                            <span>{error}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Composer ── */}
            <div style={{
                flexShrink: 0, padding: isMobile ? "10px 14px 14px" : "14px 24px 20px",
                borderTop: `1px solid ${t.borderPrimary}`, background: t.bgSecondary,
            }}>
                <div style={{
                    maxWidth: 820, margin: "0 auto",
                    display: "flex", alignItems: "flex-end", gap: 10,
                    padding: "8px 8px 8px 14px",
                    border: `1px solid ${t.borderPrimary}`,
                    borderRadius: t.cardRadius,
                    background: t.bgInput,
                }}>
                    <textarea
                        id="ai-composer"
                        ref={textareaRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
                        }}
                        placeholder={selectedNode ? "Send a message…" : "No model available"}
                        disabled={!selectedNode}
                        rows={1}
                        style={{
                            flex: 1, resize: "none", border: "none", outline: "none",
                            background: "transparent", color: t.textPrimary,
                            fontSize: "0.9rem", lineHeight: 1.6, fontFamily: t.fontFamily,
                            maxHeight: 200, padding: "6px 0",
                        }}
                    />
                    <button
                        id="ai-send"
                        onClick={() => (streaming ? stop() : send(input))}
                        disabled={!selectedNode || (!streaming && !input.trim())}
                        aria-label={streaming ? "Stop generating" : "Send message"}
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 34, height: 34, flexShrink: 0,
                            borderRadius: t.buttonRadius, border: "none",
                            background: streaming ? t.statusErrorBg : t.accentPrimary,
                            color: streaming ? t.statusError : t.textInverse,
                            cursor: (!selectedNode || (!streaming && !input.trim())) ? "not-allowed" : "pointer",
                            opacity: (!selectedNode || (!streaming && !input.trim())) ? 0.45 : 1,
                            transition: "transform 0.15s, opacity 0.15s",
                        }}
                        onMouseDown={e => { e.currentTarget.style.transform = "scale(0.94)"; }}
                        onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
                    >
                        {streaming
                            ? <Square style={{ width: 13, height: 13, fill: "currentColor" }} />
                            : <Send style={{ width: 15, height: 15 }} />}
                    </button>
                </div>

                <p style={{
                    maxWidth: 820, margin: "8px auto 0",
                    fontSize: "0.7rem", color: t.textMuted, textAlign: "center",
                }}>
                    {selectedNode
                        ? `${selectedNode.displayName} · ${selectedNode.gpuLabel} · Enter to send, Shift+Enter for a new line`
                        : "Ask an administrator to bring an inference node online."}
                </p>
            </div>

            <style>{`
                @keyframes aiBlink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
                @keyframes aiFadeIn { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }
            `}</style>
        </div>
    );
}
