"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    Send, Square, Copy, Check, Bot, User as UserIcon,
    AlertTriangle, Sparkles, History, Brain, X, RotateCcw, Clock, ImagePlus,
} from "lucide-react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useIsMobile } from "@/lib/useIsMobile";
import ModelPicker from "./ModelPicker";
import type {
    AiNodeSummary, ChatMessage, ChatPhase, QueuedMessage, ReasoningEffort,
} from "./types";

const SUGGESTIONS = [
    "Explain PCIe passthrough in one paragraph",
    "Write a bash script to rotate nginx logs",
    "Summarise the tradeoffs of ZFS vs LVM-thin",
    "Draft a status page incident update",
];

const EFFORTS: ReasoningEffort[] = ["off", "low", "medium", "high"];

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
    const [phase, setPhase] = useState<ChatPhase>("idle");
    const [queue, setQueue] = useState<QueuedMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
    const [loadingThread, setLoadingThread] = useState(false);
    const [showReasoning, setShowReasoning] = useState(true);
    const [effort, setEffort] = useState<ReasoningEffort>("medium");
    /** Pending attachments as data URLs, cleared once the turn is sent. */
    const [attachments, setAttachments] = useState<string[]>([]);

    const abortRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const pinnedToBottom = useRef(true);
    /** Queue mirror — the streaming loop reads it without stale closures. */
    const queueRef = useRef<QueuedMessage[]>([]);
    /** Thread id that survives creation mid-queue. */
    const threadRef = useRef<string | null>(activeId);
    const lastPromptRef = useRef<string | null>(null);
    const runTurnRef = useRef<((text: string, images?: string[]) => Promise<void>) | null>(null);
    /**
     * Synchronous busy latch. `phase` is state, so two Enter presses in the
     * same tick would both read "idle" and start duplicate turns — this is
     * set before any await and is the authority for whether to queue.
     */
    const busyRef = useRef(false);

    const busy = phase !== "idle";

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
                setNodeId(prev =>
                    prev ?? data.nodes.find((n: AiNodeSummary) => n.online)?.id ?? data.nodes[0]?.id ?? null);
            } catch {
                if (!cancelled) setError("Could not reach the inference cluster.");
            }
        })();
        return () => { cancelled = true; };
    }, []);

    /* ── Load transcript when the active thread changes ─────────── */
    useEffect(() => {
        // Moving to a different thread must not let queued turns land in it.
        // runTurn sets threadRef before calling onActiveChange, so the id it
        // just created reads as equal here and its own stream is left alone.
        if (activeId !== threadRef.current) {
            abortRef.current?.abort();
            abortRef.current = null;
            queueRef.current = [];
            setQueue([]);
            busyRef.current = false;
            setPhase("idle");
            setError(null);
            threadRef.current = activeId;
        }

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
                setShowReasoning(data.conversation.showReasoning ?? true);
                if (data.conversation.reasoningEffort) setEffort(data.conversation.reasoningEffort);
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
    }, [messages, queue]);

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

    /** Stop the current turn and drop anything waiting behind it. */
    const stop = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        queueRef.current = [];
        setQueue([]);
        busyRef.current = false;
        setPhase("idle");
        setMessages(prev => prev.map(m => ({ ...m, streaming: false })));
    }, []);

    /* ── One turn: send, stream, persist, then pull from queue ──── */
    const runTurn = useCallback(async (content: string, images: string[] = []) => {
        setError(null);
        pinnedToBottom.current = true;
        lastPromptRef.current = content;

        // A thread must exist before we can stream into it.
        if (!threadRef.current) {
            try {
                const res = await fetch("/api/ai/conversations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nodeId }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Failed to start chat");
                threadRef.current = data.conversation.id;
                onActiveChange(data.conversation.id);
                onConversationsChanged();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to start chat");
                busyRef.current = false;
                setPhase("idle");
                return;
            }
        }

        const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const replyId = `${localId}-a`;

        setMessages(prev => [
            ...prev,
            {
                id: localId, role: "user",
                content: content + (images.length ? `\n\n[${images.length} image(s) attached]` : ""),
            },
            { id: replyId, role: "assistant", content: "", streaming: true },
        ]);
        setPhase("connecting");

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    conversationId: threadRef.current,
                    content,
                    nodeId,
                    showReasoning,
                    reasoningEffort: effort,
                    ...(images.length ? { images } : {}),
                }),
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
                    const lines = block.split("\n");
                    const evLine = lines.find(l => l.startsWith("event:"));
                    const dataLine = lines.find(l => l.startsWith("data:"));
                    if (!evLine || !dataLine) continue;

                    const event = evLine.slice(6).trim();
                    let payload: Record<string, unknown>;
                    try { payload = JSON.parse(dataLine.slice(5).trim()); }
                    catch { continue; }

                    if (event === "meta") {
                        setMessages(prev => prev.map(m => m.id === replyId
                            ? { ...m, gpuLabel: payload.gpuLabel as string, modelId: payload.model as string }
                            : m));
                    } else if (event === "reasoning") {
                        setPhase(p => (p === "streaming" ? p : "thinking"));
                        const chunk = (payload.text as string) ?? "";
                        const chars = payload.chars as number;
                        setMessages(prev => prev.map(m => m.id === replyId
                            ? {
                                ...m,
                                reasoning: chunk ? (m.reasoning ?? "") + chunk : m.reasoning,
                                reasoningChars: chars,
                            }
                            : m));
                    } else if (event === "delta") {
                        setPhase("streaming");
                        const chunk = payload.text as string;
                        setMessages(prev => prev.map(m => m.id === replyId
                            ? { ...m, content: m.content + chunk } : m));
                    } else if (event === "done") {
                        setMessages(prev => prev.map(m => m.id === replyId
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
                // Stopped by the user — keep whatever text already arrived.
            } else {
                setError(err instanceof Error ? err.message : "Generation failed");
                // Drop an assistant bubble that never produced anything.
                setMessages(prev => prev.filter(m => m.id !== replyId || m.content.length > 0));
                // A failed turn should not silently drag the queue down with it.
                queueRef.current = [];
                setQueue([]);
            }
        } finally {
            abortRef.current = null;
            setMessages(prev => prev.map(m => ({ ...m, streaming: false })));

            const next = queueRef.current.shift();
            setQueue([...queueRef.current]);
            if (next) {
                void runTurnRef.current?.(next.content, next.images ?? []);
            } else {
                busyRef.current = false;
                setPhase("idle");
            }
        }
    }, [nodeId, showReasoning, effort, onActiveChange, onConversationsChanged]);

    useEffect(() => { runTurnRef.current = runTurn; }, [runTurn]);

    /** Enqueue while busy, otherwise start immediately. */
    const send = useCallback((text: string) => {
        const content = text.trim();
        if (!content) return;

        // Attachments belong to this turn, so detach them from the composer
        // now — otherwise a queued turn and the next one share the same set.
        const images = attachments;
        setInput("");
        setAttachments([]);

        if (busyRef.current) {
            const item = {
                id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                content,
                images,
            };
            queueRef.current = [...queueRef.current, item];
            setQueue([...queueRef.current]);
            pinnedToBottom.current = true;
            return;
        }
        busyRef.current = true;
        void runTurn(content, images);
    }, [runTurn, attachments]);

    /** Read picked files as data URLs, enforcing the same limits as the API. */
    const attachFiles = useCallback(async (files: FileList | null) => {
        if (!files?.length) return;
        const allowed = /^image\/(png|jpeg|jpg|webp|gif)$/;
        const picked: string[] = [];

        for (const file of Array.from(files).slice(0, 4)) {
            if (!allowed.test(file.type)) {
                setError(`${file.name} is not a supported image type.`);
                continue;
            }
            if (file.size > 8 * 1024 * 1024) {
                setError(`${file.name} is larger than 8 MB.`);
                continue;
            }
            picked.push(await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(file);
            }));
        }

        if (picked.length) {
            setAttachments(prev => [...prev, ...picked].slice(0, 4));
        }
    }, []);

    const unqueue = (id: string) => {
        queueRef.current = queueRef.current.filter(q => q.id !== id);
        setQueue([...queueRef.current]);
    };

    const retry = () => {
        if (!lastPromptRef.current || busyRef.current) return;
        busyRef.current = true;
        void runTurn(lastPromptRef.current);
    };

    const copy = async (msg: ChatMessage) => {
        await navigator.clipboard.writeText(msg.content);
        setCopiedId(msg.id);
        setTimeout(() => setCopiedId(null), 1600);
    };

    const selectedNode = nodes.find(n => n.id === nodeId) ?? null;
    const showWelcome = messages.length === 0 && queue.length === 0 && !loadingThread;

    const PHASE_LABEL: Record<ChatPhase, string> = {
        idle: "Ready",
        connecting: "Connecting…",
        thinking: "Thinking…",
        streaming: "Writing…",
    };

    const chip: React.CSSProperties = {
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.03em",
        padding: "3px 9px", borderRadius: 20,
    };

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
                    <ModelPicker nodes={nodes} selectedId={nodeId} onSelect={setNodeId} disabled={busy} />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {queue.length > 0 && (
                        <span id="ai-queue-count" style={{
                            ...chip, background: t.bgTertiary, color: t.textSecondary,
                        }}>
                            <Clock style={{ width: 11, height: 11 }} />
                            {queue.length} queued
                        </span>
                    )}
                    <span id="ai-phase" style={{
                        ...chip,
                        background: busy ? t.accentPrimaryMuted : t.bgTertiary,
                        color: busy ? t.accentPrimary : t.textMuted,
                    }}>
                        <span style={{
                            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                            background: busy ? t.accentPrimary : t.textMuted,
                            animation: busy ? "aiPulse 1.2s ease-in-out infinite" : "none",
                        }} />
                        {!isMobile && PHASE_LABEL[phase]}
                    </span>
                </div>
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
                                            {(msg.reasoning || msg.reasoningChars) && (() => {
                                                const thinking = msg.streaming && !msg.content;
                                                const open = msg.reasoning
                                                    ? (thinking || openReasoning.has(msg.id))
                                                    : false;
                                                return (
                                                    <div style={{ marginBottom: msg.content ? 12 : 0 }}>
                                                        <button
                                                            onClick={() => setOpenReasoning(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(msg.id)) next.delete(msg.id);
                                                                else next.add(msg.id);
                                                                return next;
                                                            })}
                                                            disabled={thinking || !msg.reasoning}
                                                            style={{
                                                                display: "inline-flex", alignItems: "center", gap: 6,
                                                                padding: 0, border: "none", background: "transparent",
                                                                color: t.textMuted, fontSize: "0.75rem", fontWeight: 600,
                                                                cursor: (thinking || !msg.reasoning) ? "default" : "pointer",
                                                                fontFamily: t.fontFamily, marginBottom: 6,
                                                            }}
                                                        >
                                                            <Brain style={{ width: 12, height: 12 }} />
                                                            {thinking
                                                                ? "Thinking…"
                                                                : !msg.reasoning
                                                                    ? "Reasoned quietly"
                                                                    : open ? "Hide reasoning" : "Show reasoning"}
                                                        </button>
                                                        {open && msg.reasoning && (
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

                    {/* Queued turns — not yet sent anywhere. */}
                    {queue.map(q => (
                        <div key={q.id} style={{ display: "flex", gap: 14, marginBottom: 26, opacity: 0.55 }}>
                            <div style={{
                                width: 30, height: 30, flexShrink: 0,
                                borderRadius: t.isMono ? 0 : "50%",
                                background: t.bgTertiary,
                                border: `1px dashed ${t.borderPrimary}`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                <Clock style={{ width: 14, height: 14, color: t.textMuted }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: t.textPrimary }}>You</span>
                                    <span style={{ ...chip, background: t.bgTertiary, color: t.textMuted, padding: "1px 7px" }}>
                                        QUEUED
                                    </span>
                                    <button
                                        onClick={() => unqueue(q.id)}
                                        aria-label="Remove from queue"
                                        style={{
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            width: 20, height: 20, border: "none", background: "transparent",
                                            color: t.textMuted, cursor: "pointer",
                                        }}
                                    >
                                        <X style={{ width: 12, height: 12 }} />
                                    </button>
                                </div>
                                <p style={{
                                    fontSize: "0.9rem", lineHeight: 1.7, color: t.textSecondary,
                                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                                }}>
                                    {q.content}
                                </p>
                            </div>
                        </div>
                    ))}

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
                            <span style={{ flex: 1 }}>{error}</span>
                            {lastPromptRef.current && phase === "idle" && (
                                <button
                                    onClick={retry}
                                    style={{
                                        display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
                                        padding: "3px 9px", borderRadius: t.buttonRadius,
                                        border: `1px solid ${t.statusError}55`,
                                        background: "transparent", color: t.statusError,
                                        fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
                                        fontFamily: t.fontFamily,
                                    }}
                                >
                                    <RotateCcw style={{ width: 11, height: 11 }} />
                                    Retry
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Composer ── */}
            <div style={{
                flexShrink: 0, padding: isMobile ? "10px 14px 14px" : "14px 24px 20px",
                borderTop: `1px solid ${t.borderPrimary}`, background: t.bgSecondary,
            }}>
                {/* Reasoning controls */}
                <div style={{
                    maxWidth: 820, margin: "0 auto 8px",
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                }}>
                    <button
                        id="ai-toggle-reasoning"
                        onClick={() => setShowReasoning(v => !v)}
                        title="Show or hide the model's scratchpad. Applied on our side, so it always works."
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "4px 10px", borderRadius: t.buttonRadius,
                            border: `1px solid ${showReasoning ? t.accentPrimary : t.borderPrimary}`,
                            background: showReasoning ? t.accentPrimaryMuted : "transparent",
                            color: showReasoning ? t.accentPrimary : t.textMuted,
                            fontSize: "0.73rem", fontWeight: 600, cursor: "pointer",
                            fontFamily: t.fontFamily,
                        }}
                    >
                        <Brain style={{ width: 12, height: 12 }} />
                        Reasoning {showReasoning ? "shown" : "hidden"}
                    </button>

                    {selectedNode?.reasoningControl ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {EFFORTS.map(e => (
                                <button
                                    key={e}
                                    onClick={() => setEffort(e)}
                                    style={{
                                        padding: "4px 9px", borderRadius: t.buttonRadius,
                                        border: `1px solid ${effort === e ? t.accentPrimary : t.borderPrimary}`,
                                        background: effort === e ? t.accentPrimaryMuted : "transparent",
                                        color: effort === e ? t.accentPrimary : t.textMuted,
                                        fontSize: "0.72rem", fontWeight: 600, cursor: "pointer",
                                        fontFamily: t.fontFamily, textTransform: "capitalize",
                                    }}
                                >
                                    {e}
                                </button>
                            ))}
                        </span>
                    ) : selectedNode && (
                        <span style={{ fontSize: "0.7rem", color: t.textMuted }}>
                            Effort control not supported by this model
                        </span>
                    )}
                </div>

                {/* Pending attachments */}
                {attachments.length > 0 && (
                    <div style={{
                        maxWidth: 820, margin: "0 auto 8px",
                        display: "flex", gap: 8, flexWrap: "wrap",
                    }}>
                        {attachments.map((src, i) => (
                            <span key={i} style={{ position: "relative", display: "inline-block" }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={src}
                                    alt={`Attachment ${i + 1}`}
                                    style={{
                                        width: 56, height: 56, objectFit: "cover",
                                        borderRadius: t.cardRadius,
                                        border: `1px solid ${t.borderPrimary}`,
                                        display: "block",
                                    }}
                                />
                                <button
                                    onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                                    aria-label={`Remove attachment ${i + 1}`}
                                    style={{
                                        position: "absolute", top: -6, right: -6,
                                        width: 20, height: 20, borderRadius: "50%",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        border: `1px solid ${t.borderPrimary}`,
                                        background: t.bgCard, color: t.textSecondary,
                                        cursor: "pointer", padding: 0,
                                    }}
                                >
                                    <X style={{ width: 11, height: 11 }} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

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
                        placeholder={
                            !selectedNode ? "No model available"
                                : busy ? "Type to queue the next message…"
                                    : "Send a message…"
                        }
                        disabled={!selectedNode}
                        rows={1}
                        style={{
                            flex: 1, resize: "none", border: "none", outline: "none",
                            background: "transparent", color: t.textPrimary,
                            fontSize: "0.9rem", lineHeight: 1.6, fontFamily: t.fontFamily,
                            maxHeight: 200, padding: "6px 0",
                        }}
                    />

                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        onChange={e => { void attachFiles(e.target.files); e.target.value = ""; }}
                        style={{ display: "none" }}
                    />
                    <button
                        id="ai-attach"
                        onClick={() => fileRef.current?.click()}
                        disabled={!selectedNode || attachments.length >= 4}
                        aria-label="Attach image"
                        title={attachments.length >= 4 ? "Four images maximum" : "Attach an image"}
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 34, height: 34, flexShrink: 0,
                            borderRadius: t.buttonRadius,
                            border: `1px solid ${t.borderPrimary}`,
                            background: "transparent", color: t.textSecondary,
                            cursor: (!selectedNode || attachments.length >= 4) ? "not-allowed" : "pointer",
                            opacity: (!selectedNode || attachments.length >= 4) ? 0.45 : 1,
                        }}
                    >
                        <ImagePlus style={{ width: 15, height: 15 }} />
                    </button>

                    {/* Queue-ahead send stays available while streaming. */}
                    {busy && input.trim() && (
                        <button
                            id="ai-queue"
                            onClick={() => send(input)}
                            aria-label="Queue message"
                            title="Queue this message"
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 34, height: 34, flexShrink: 0,
                                borderRadius: t.buttonRadius,
                                border: `1px solid ${t.borderPrimary}`,
                                background: "transparent", color: t.textSecondary, cursor: "pointer",
                            }}
                        >
                            <Clock style={{ width: 15, height: 15 }} />
                        </button>
                    )}

                    <button
                        id="ai-send"
                        onClick={() => (busy ? stop() : send(input))}
                        disabled={!selectedNode || (!busy && !input.trim())}
                        aria-label={busy ? "Stop generating" : "Send message"}
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 34, height: 34, flexShrink: 0,
                            borderRadius: t.buttonRadius, border: "none",
                            background: busy ? t.statusErrorBg : t.accentPrimary,
                            color: busy ? t.statusError : t.textInverse,
                            cursor: (!selectedNode || (!busy && !input.trim())) ? "not-allowed" : "pointer",
                            opacity: (!selectedNode || (!busy && !input.trim())) ? 0.45 : 1,
                            transition: "transform 0.15s, opacity 0.15s",
                        }}
                        onMouseDown={e => { e.currentTarget.style.transform = "scale(0.94)"; }}
                        onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
                    >
                        {busy
                            ? <Square style={{ width: 13, height: 13, fill: "currentColor" }} />
                            : <Send style={{ width: 15, height: 15 }} />}
                    </button>
                </div>

                <p style={{
                    maxWidth: 820, margin: "8px auto 0",
                    fontSize: "0.7rem", color: t.textMuted, textAlign: "center",
                }}>
                    {selectedNode
                        ? busy
                            ? "Stop also clears the queue · Enter queues the next message"
                            : `${selectedNode.displayName} · ${selectedNode.gpuLabel} · Enter to send, Shift+Enter for a new line`
                        : "Ask an administrator to bring an inference node online."}
                </p>
            </div>

            <style>{`
                @keyframes aiBlink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
                @keyframes aiFadeIn { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }
                @keyframes aiPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
            `}</style>
        </div>
    );
}
