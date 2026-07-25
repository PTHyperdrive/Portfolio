"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { useIsMobile } from "@/lib/useIsMobile";
import { useThemeTokens } from "@/lib/useThemeTokens";
import ConversationSidebar from "@/components/ai/ConversationSidebar";
import AiChatView from "@/components/ai/AiChatView";
import type { ConversationSummary } from "@/components/ai/types";

export default function AiStudioPage() {
    const t = useThemeTokens();
    const isMobile = useIsMobile();

    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);

    const loadConversations = useCallback(async () => {
        try {
            const res = await fetch("/api/ai/conversations");
            if (!res.ok) return;
            const data = await res.json();
            setConversations(data.conversations);
        } catch {
            /* the chat view surfaces its own errors */
        }
    }, []);

    useEffect(() => { loadConversations(); }, [loadConversations]);

    // "New chat" just clears the pane. The row is created on first send, so
    // clicking it repeatedly cannot litter the sidebar with empty threads.
    const handleCreate = useCallback(() => {
        setActiveId(null);
        setHistoryOpen(false);
    }, []);

    const handleSelect = useCallback((id: string) => {
        setActiveId(id);
        setHistoryOpen(false);
    }, []);

    const handleDelete = useCallback(async (id: string) => {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeId === id) setActiveId(null);
        try {
            await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
        } finally {
            loadConversations();
        }
    }, [activeId, loadConversations]);

    const sidebar = (
        <ConversationSidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelect}
            onCreate={handleCreate}
            onDelete={handleDelete}
        />
    );

    const chat = (
        <AiChatView
            activeId={activeId}
            onActiveChange={setActiveId}
            onConversationsChanged={loadConversations}
            onOpenHistory={isMobile ? () => setHistoryOpen(true) : undefined}
        />
    );

    /* ── Mobile: the dashboard shell already owns the top bar, so the
          conversation list rides in as its own overlay. ── */
    if (isMobile) {
        return (
            <>
                {chat}
                {historyOpen && (
                    <div
                        onClick={() => setHistoryOpen(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 59, background: "rgba(0,0,0,0.55)" }}
                    />
                )}
                <div style={{
                    position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 60,
                    width: 280, maxWidth: "85vw",
                    transform: historyOpen ? "translateX(0)" : "translateX(-100%)",
                    transition: "transform 0.2s ease",
                    boxShadow: historyOpen ? "2px 0 16px rgba(0,0,0,0.4)" : "none",
                }}>
                    <button
                        onClick={() => setHistoryOpen(false)}
                        aria-label="Close history"
                        style={{
                            position: "absolute", top: 10, right: 10, zIndex: 61,
                            width: 32, height: 32,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            border: "none", background: "transparent", color: t.textMuted, cursor: "pointer",
                        }}
                    >
                        <X style={{ width: 18, height: 18 }} />
                    </button>
                    {sidebar}
                </div>
            </>
        );
    }

    return (
        <div style={{
            display: "flex", height: "100dvh", width: "100%", overflow: "hidden",
            background: t.bgPrimary, color: t.textPrimary,
        }}>
            {sidebar}
            <div style={{ flex: 1, minWidth: 0 }}>{chat}</div>
        </div>
    );
}
