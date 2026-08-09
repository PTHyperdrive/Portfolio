"use client";

/**
 * SupportChatWidget — the floating AI support bubble.
 *
 * Opt-in by design: the first open shows a consent card, and no SUPPORT
 * conversation exists server-side until the user accepts (the API enforces
 * this too — the card here is presentation, not the control).
 *
 * Streams over the same SSE contract as AiChatView (POST fetch + reader,
 * events meta/reasoning/delta/done/error). Deliberately NOT the polling
 * pattern used by ContactSalesWidget.
 *
 * Sits above the sales FAB: sales owns bottom 28, this owns bottom 96 in the
 * same right-hand column.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useIsMobile } from "@/lib/useIsMobile";
import { Bot, X, Send, Loader2, Sparkles, ShieldCheck } from "lucide-react";

type Msg = {
    id: string;
    role: "user" | "assistant";
    content: string;
    streaming?: boolean;
};

const EXCLUDED_PREFIXES = ["/adminsystemnrsp", "/console-window", "/auth", "/dashboard/studio"];

export default function SupportChatWidget() {
    const t = useThemeTokens();
    const pathname = usePathname() ?? "";
    const isMobile = useIsMobile();
    const { status: authStatus } = useSession();

    const [open, setOpen] = useState(false);
    const [booting, setBooting] = useState(false);
    const [consented, setConsented] = useState<boolean | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const abortRef = useRef<AbortController | null>(null);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Kill an in-flight stream if the widget unmounts mid-answer.
    useEffect(() => () => abortRef.current?.abort(), []);

    /** Load (or lazily create) the single SUPPORT thread and its transcript. */
    const loadThread = async () => {
        const listRes = await fetch("/api/ai/conversations?kind=SUPPORT");
        if (!listRes.ok) throw new Error("Failed to load support chat");
        const { conversations } = await listRes.json();

        let id: string | null = conversations?.[0]?.id ?? null;
        if (!id) {
            const createRes = await fetch("/api/ai/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind: "SUPPORT" }),
            });
            if (!createRes.ok) throw new Error("Failed to start support chat");
            id = (await createRes.json()).conversation.id;
        }

        const msgRes = await fetch(`/api/ai/conversations/${id}`);
        if (msgRes.ok) {
            const { conversation } = await msgRes.json();
            setMessages(
                (conversation.messages ?? [])
                    .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
                    .map((m: { id: string; role: "user" | "assistant"; content: string }) => ({
                        id: m.id, role: m.role, content: m.content,
                    })),
            );
        }
        setConversationId(id);
    };

    const openWidget = async () => {
        setOpen(true);
        setError("");
        setBooting(true);
        try {
            const res = await fetch("/api/ai/support/consent");
            const data = res.ok ? await res.json() : { consentedAt: null };
            const has = Boolean(data.consentedAt);
            setConsented(has);
            if (has) await loadThread();
        } catch {
            setError("Support chat is unavailable right now.");
        } finally {
            setBooting(false);
        }
    };

    const acceptConsent = async () => {
        setBooting(true);
        setError("");
        try {
            const res = await fetch("/api/ai/support/consent", { method: "POST" });
            if (!res.ok) throw new Error();
            setConsented(true);
            await loadThread();
        } catch {
            setError("Could not start the chat. Please try again.");
        } finally {
            setBooting(false);
        }
    };

    const send = async () => {
        const content = input.trim();
        if (!content || busy || !conversationId) return;

        setInput("");
        setError("");
        setBusy(true);

        const localId = `local-${Date.now()}`;
        const replyId = `reply-${Date.now()}`;
        setMessages(prev => [
            ...prev,
            { id: localId, role: "user", content },
            { id: replyId, role: "assistant", content: "", streaming: true },
        ]);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId, content }),
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

                    if (event === "delta") {
                        const chunk = payload.text as string;
                        setMessages(prev => prev.map(m =>
                            m.id === replyId ? { ...m, content: m.content + chunk } : m));
                    } else if (event === "done") {
                        setMessages(prev => prev.map(m =>
                            m.id === replyId ? { ...m, streaming: false } : m));
                    } else if (event === "error") {
                        throw new Error((payload.message as string) || "Generation failed");
                    }
                    // "reasoning" events are ignored: a support widget shows
                    // answers, not scratchpads.
                }
            }
        } catch (err) {
            if (!(err instanceof Error && err.name === "AbortError")) {
                setError(err instanceof Error ? err.message : "Generation failed");
                setMessages(prev => prev.filter(m => m.id !== replyId || m.content.length > 0));
            }
        } finally {
            abortRef.current = null;
            setMessages(prev => prev.map(m => ({ ...m, streaming: false })));
            setBusy(false);
        }
    };

    // After all hooks (Rules of Hooks): hidden on excluded routes and for guests.
    if (EXCLUDED_PREFIXES.some(p => pathname.startsWith(p))) return null;
    if (authStatus !== "authenticated") return null;

    // ── FAB ──
    if (!open) return (
        <button
            id="ai-support-fab"
            onClick={openWidget}
            style={{
                position: "fixed", bottom: 96, right: 28,
                width: 56, height: 56, borderRadius: "50%", border: "none",
                background: t.isMono ? t.accentPrimary : "linear-gradient(135deg,#10b981,#0d9488)",
                color: t.isMono ? t.bgPrimary : "#fff", cursor: "pointer",
                boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
                zIndex: 9000, transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            title="AI Support"
        >
            <Bot style={{ width: 26, height: 26 }} />
        </button>
    );

    // ── Panel ──
    const panelStyle: React.CSSProperties = isMobile
        ? {
            position: "fixed", inset: "auto 8px 8px 8px", height: "min(560px, calc(100dvh - 16px))",
            zIndex: 9100,
        }
        : {
            position: "fixed", bottom: 96, right: 28, width: 380, height: 560,
            zIndex: 9100,
        };

    return (
        <div id="ai-support-panel" style={{
            ...panelStyle,
            background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
            borderRadius: t.cardRadius, boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
            {/* Header */}
            <div style={{
                padding: "16px 18px", borderBottom: `1px solid ${t.borderSecondary}`,
                background: t.isMono ? t.bgSecondary : "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(13,148,136,0.08))",
                display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: t.isMono ? t.accentPrimaryMuted : "linear-gradient(135deg,#10b981,#0d9488)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <Bot style={{ width: 18, height: 18, color: t.isMono ? t.accentPrimary : "#fff" }} />
                    </div>
                    <div>
                        <p style={{ fontWeight: 800, fontSize: "0.95rem", color: t.textPrimary }}>AI Support</p>
                        <p style={{ fontSize: "0.65rem", color: t.textMuted }}>
                            Answers about NotRespond, powered by our own AI
                        </p>
                    </div>
                </div>
                <button onClick={() => setOpen(false)} style={{
                    width: 28, height: 28, borderRadius: "50%", border: `1px solid ${t.borderPrimary}`,
                    background: "transparent", color: t.textMuted, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}><X style={{ width: 13, height: 13 }} /></button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {booting ? (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Loader2 style={{ width: 24, height: 24, color: t.accentPrimary, animation: "spin 1s linear infinite" }} />
                    </div>
                ) : consented === false ? (
                    /* Consent gate */
                    <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16, textAlign: "center" }}>
                        <Sparkles style={{ width: 40, height: 40, color: t.accentPrimary, margin: "0 auto", opacity: 0.85 }} />
                        <h3 style={{ fontWeight: 800, fontSize: "1.05rem", color: t.textPrimary }}>Chat with our AI assistant?</h3>
                        <p style={{ fontSize: "0.82rem", color: t.textMuted, lineHeight: 1.6 }}>
                            Get instant help using the platform — deployments, networking,
                            billing and your account. Answers come from an AI running on our
                            own hardware; your messages stay on this platform. For anything
                            it can&apos;t solve, open a support ticket.
                        </p>
                        <button onClick={acceptConsent} style={{
                            padding: "12px 0", borderRadius: t.buttonRadius, border: "none",
                            background: t.accentPrimary, color: t.isMono ? t.bgPrimary : "#fff",
                            fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }}>
                            <ShieldCheck style={{ width: 15, height: 15 }} /> Start chatting
                        </button>
                        <button onClick={() => setOpen(false)} style={{
                            padding: "10px 0", borderRadius: t.buttonRadius,
                            background: "transparent", color: t.textSecondary,
                            border: `1px solid ${t.borderPrimary}`, fontWeight: 600,
                            fontSize: "0.85rem", cursor: "pointer",
                        }}>Not now</button>
                        {error && <p style={{ fontSize: "0.78rem", color: t.statusError }}>{error}</p>}
                    </div>
                ) : (
                    /* Chat */
                    <>
                        <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                            {messages.length === 0 && (
                                <div style={{ textAlign: "center", padding: "40px 0" }}>
                                    <Bot style={{ width: 32, height: 32, color: t.textMuted, opacity: 0.3, margin: "0 auto 12px" }} />
                                    <p style={{ fontSize: "0.82rem", color: t.textMuted }}>
                                        Ask anything about using NotRespond.
                                    </p>
                                </div>
                            )}
                            {messages.map(msg => (
                                <div key={msg.id} style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                                    <div style={{
                                        padding: "10px 14px", borderRadius: 14,
                                        background: msg.role === "user"
                                            ? (t.isMono ? t.accentPrimary : "linear-gradient(135deg,#10b981,#0d9488)")
                                            : t.bgSecondary,
                                        color: msg.role === "user" ? (t.isMono ? t.bgPrimary : "#fff") : t.textPrimary,
                                        border: msg.role === "user" ? "none" : `1px solid ${t.borderSecondary}`,
                                    }}>
                                        <p style={{ fontSize: "0.82rem", lineHeight: 1.55, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                                            {msg.content || (msg.streaming ? "…" : "")}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {error && (
                                <p style={{ fontSize: "0.75rem", color: t.statusError, textAlign: "center" }}>{error}</p>
                            )}
                            <div ref={endRef} />
                        </div>

                        {/* Composer */}
                        <div style={{ padding: "12px 14px", borderTop: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                                placeholder="Ask about the platform..."
                                disabled={busy}
                                style={{
                                    flex: 1, padding: "10px 14px", borderRadius: 20,
                                    background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
                                    color: t.textPrimary, fontSize: "0.85rem",
                                    fontFamily: t.fontFamily, outline: "none",
                                }}
                            />
                            <button onClick={() => void send()} disabled={!input.trim() || busy} style={{
                                width: 38, height: 38, borderRadius: "50%", border: "none",
                                background: input.trim() && !busy ? t.accentPrimary : t.bgTertiary,
                                color: input.trim() && !busy ? (t.isMono ? t.bgPrimary : "#fff") : t.textMuted,
                                cursor: input.trim() && !busy ? "pointer" : "not-allowed",
                                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
                            }}>
                                {busy
                                    ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                                    : <Send style={{ width: 16, height: 16 }} />}
                            </button>
                        </div>
                        <div style={{ padding: "8px 14px", borderTop: `1px solid ${t.borderSecondary}` }}>
                            <p style={{ fontSize: "0.62rem", color: t.textMuted }}>
                                AI answers can be wrong — verify anything important, or open a ticket.
                            </p>
                        </div>
                    </>
                )}
            </div>

            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}
