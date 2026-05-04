"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    MessagesSquare, RefreshCw, User, Lock, Shield, Clock,
    X, MessageCircle, ChevronRight, Loader2, ToggleLeft, ToggleRight
} from "lucide-react";

interface ChatThread {
    id: string; userId: string; closed: boolean; createdAt: string;
    user: { id: string; name: string | null; email: string };
    messageCount: number; lastMessageAt: string; lastSenderType: string | null;
    secretChatEligible: boolean;
}

interface ChatMessage {
    id: string; senderType: string; ciphertext: string; iv: string; createdAt: string;
}

interface ChatDetail {
    id: string; userId: string; closed: boolean; createdAt: string; publicKey: string;
    user: { id: string; name: string | null; email: string };
    messages: ChatMessage[];
    secretChatEligible: boolean;
}

export default function AdminChatsPage() {
    const t = useThemeTokens();
    const [chats, setChats] = useState<ChatThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<ChatDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [toggling, setToggling] = useState(false);

    const loadChats = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/chats");
            if (res.ok) setChats(await res.json());
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadChats(); }, [loadChats]);

    const loadDetail = useCallback(async (chatId: string) => {
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/admin/chats/${chatId}`);
            if (res.ok) setDetail(await res.json());
        } catch { /* silent */ }
        finally { setDetailLoading(false); }
    }, []);

    const selectChat = (chatId: string) => {
        setSelectedId(chatId);
        loadDetail(chatId);
    };

    const toggleClosed = async () => {
        if (!detail) return;
        setToggling(true);
        try {
            const res = await fetch(`/api/admin/chats/${detail.id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ closed: !detail.closed }),
            });
            if (res.ok) {
                setDetail(prev => prev ? { ...prev, closed: !prev.closed } : null);
                loadChats();
            }
        } catch { /* silent */ }
        finally { setToggling(false); }
    };

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>Admin System &bull; Support Chat</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <MessagesSquare style={{ width: 22, height: 22, color: t.statusWarning }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Support Chat Manager</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>End-to-end encrypted admin support conversations.</p>
                        </div>
                    </div>
                    <button onClick={loadChats} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                        <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                    </button>
                </div>
            </div>

            {/* Two-column layout */}
            <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, height: "calc(100vh - 180px)" }}>
                {/* Chat List */}
                <div style={{ ...card, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>Conversations</span>
                        <span style={{ padding: "2px 8px", borderRadius: 8, background: t.accentPrimaryMuted, color: t.accentPrimary, fontSize: "0.7rem", fontWeight: 700 }}>{chats.length}</span>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        {loading ? (
                            <div style={{ padding: 24, textAlign: "center", color: t.textMuted }}>Loading...</div>
                        ) : chats.length === 0 ? (
                            <div style={{ padding: 24, textAlign: "center", color: t.textMuted, fontSize: "0.85rem" }}>No chat threads yet.</div>
                        ) : (
                            chats.map(chat => (
                                <div key={chat.id} onClick={() => selectChat(chat.id)} style={{
                                    padding: "14px 18px", cursor: "pointer", borderBottom: `1px solid ${t.borderSecondary}`,
                                    background: selectedId === chat.id ? t.accentPrimaryMuted : "transparent",
                                    transition: "background 0.1s",
                                }}
                                    onMouseEnter={e => { if (selectedId !== chat.id) e.currentTarget.style.background = t.bgCardHover; }}
                                    onMouseLeave={e => { if (selectedId !== chat.id) e.currentTarget.style.background = "transparent"; }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            <User style={{ width: 16, height: 16, color: t.accentPrimary }} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chat.user.name || chat.user.email}</p>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                                <span style={{ fontSize: "0.68rem", color: t.textMuted }}>{chat.messageCount} messages</span>
                                                {chat.closed && <span style={{ fontSize: "0.6rem", padding: "1px 5px", borderRadius: 3, background: t.statusErrorBg, color: t.statusError, fontWeight: 700 }}>Closed</span>}
                                                {chat.secretChatEligible && <Lock style={{ width: 9, height: 9, color: t.statusSuccess }} />}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                                            <p style={{ fontSize: "0.65rem", color: t.textMuted }}>{new Date(chat.lastMessageAt).toLocaleDateString()}</p>
                                            <ChevronRight style={{ width: 12, height: 12, color: t.textMuted, marginTop: 2 }} />
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Chat Detail / Conversation View */}
                <div style={{ ...card, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    {!selectedId ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: t.textMuted }}>
                            <MessageCircle style={{ width: 40, height: 40, opacity: 0.3 }} />
                            <p style={{ fontSize: "0.9rem" }}>Select a conversation to view</p>
                        </div>
                    ) : detailLoading ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Loader2 style={{ width: 24, height: 24, color: t.accentPrimary, animation: "spin 1s linear infinite" }} />
                        </div>
                    ) : detail ? (
                        <>
                            {/* Chat Header */}
                            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <Shield style={{ width: 16, height: 16, color: t.statusSuccess }} />
                                    <div>
                                        <p style={{ fontWeight: 700, fontSize: "0.88rem", color: t.textPrimary }}>{detail.user.name || detail.user.email}</p>
                                        <p style={{ fontSize: "0.65rem", color: t.statusSuccess, display: "flex", alignItems: "center", gap: 4 }}>
                                            <Lock style={{ width: 9, height: 9 }} /> E2EE &mdash; {detail.messages.length} messages
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    {/* Secret Chat Toggle */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: t.isMono ? 4 : 8, background: detail.secretChatEligible ? t.bgTertiary : t.bgSecondary, border: `1px solid ${detail.secretChatEligible ? t.borderPrimary : t.borderSecondary}`, opacity: detail.secretChatEligible ? 1 : 0.5 }}>
                                        {detail.secretChatEligible ? <ToggleRight style={{ width: 16, height: 16, color: t.statusSuccess }} /> : <ToggleLeft style={{ width: 16, height: 16, color: t.textMuted }} />}
                                        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: detail.secretChatEligible ? t.statusSuccess : t.textMuted }}>Secret Chat</span>
                                    </div>
                                    {!detail.secretChatEligible && (
                                        <span style={{ fontSize: "0.6rem", color: t.textMuted, maxWidth: 120 }}>Available after 30 days</span>
                                    )}
                                    {/* Close toggle */}
                                    <button onClick={toggleClosed} disabled={toggling} style={{
                                        padding: "5px 12px", borderRadius: t.isMono ? 4 : 6, border: `1px solid ${t.borderPrimary}`,
                                        background: detail.closed ? t.statusSuccessBg : t.statusErrorBg,
                                        color: detail.closed ? t.statusSuccess : t.statusError,
                                        fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                                    }}>
                                        {detail.closed ? "Reopen" : "Close"}
                                    </button>
                                </div>
                            </div>

                            {/* Messages */}
                            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                                {detail.messages.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: "40px 0", color: t.textMuted }}>
                                        <MessageCircle style={{ width: 32, height: 32, opacity: 0.3, margin: "0 auto 12px" }} />
                                        <p style={{ fontSize: "0.85rem" }}>No messages in this thread.</p>
                                    </div>
                                ) : (
                                    detail.messages.map(msg => (
                                        <div key={msg.id} style={{ alignSelf: msg.senderType === "ADMIN" ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                                            <div style={{
                                                padding: "10px 14px", borderRadius: 14,
                                                background: msg.senderType === "ADMIN" ? (t.isMono ? t.accentPrimary : "linear-gradient(135deg,#3b82f6,#2563eb)") : t.bgSecondary,
                                                color: msg.senderType === "ADMIN" ? (t.isMono ? t.bgPrimary : "#fff") : t.textPrimary,
                                                border: msg.senderType === "ADMIN" ? "none" : `1px solid ${t.borderSecondary}`,
                                            }}>
                                                <p style={{ fontSize: "0.82rem", lineHeight: 1.5, wordBreak: "break-word" }}>[Encrypted message]</p>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                                                <Lock style={{ width: 8, height: 8, color: t.textMuted }} />
                                                <p style={{ fontSize: "0.6rem", color: t.textMuted, textAlign: msg.senderType === "ADMIN" ? "right" : "left" }}>
                                                    {msg.senderType} &mdash; {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Info Banner */}
                            <div style={{ padding: "10px 20px", borderTop: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 8 }}>
                                <Lock style={{ width: 12, height: 12, color: t.statusSuccess }} />
                                <p style={{ fontSize: "0.72rem", color: t.textMuted }}>Messages are end-to-end encrypted. Admin PIN is required to decrypt content.</p>
                            </div>
                        </>
                    ) : null}
                </div>
            </div>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
