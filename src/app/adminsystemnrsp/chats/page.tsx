"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    MessagesSquare, RefreshCw, User, Lock, Shield, Unlock, Send,
    X, MessageCircle, ChevronRight, Loader2, KeyRound, Eye, EyeOff
} from "lucide-react";
import {
    pinToWrappingKey, generateECDHKeypair, exportPubKey, exportPrivKey,
    encryptPrivateKey, decryptPrivateKey, deriveSharedKey,
    encryptMessage, decryptMessage,
} from "@/lib/chatCrypto";
import bcrypt from "bcryptjs";

interface ChatThread {
    id: string; userId: string; closed: boolean; createdAt: string;
    user: { id: string; name: string | null; email: string };
    messageCount: number; lastMessageAt: string; lastSenderType: string | null;
}
interface ChatMessage { id: string; senderType: string; ciphertext: string; iv: string; createdAt: string; }
interface ChatDetail {
    id: string; userId: string; closed: boolean; closedAt: string | null;
    createdAt: string; userPubKey: string;
    user: { id: string; name: string | null; email: string };
    messages: ChatMessage[];
}

// ── PIN Gate ─────────────────────────────────────────────────────────────────
function PinGate({ onUnlock, t }: { onUnlock: (pk: CryptoKey) => void; t: ReturnType<typeof useThemeTokens> }) {
    const [pin, setPin] = useState(""); const [pinC, setPinC] = useState("");
    const [show, setShow] = useState(false); const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false); const [checking, setChecking] = useState(true);
    const [isSetup, setIsSetup] = useState(false);
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        (async () => { try { const r = await fetch("/api/admin/chats/setup"); const d = await r.json(); setIsSetup(!d.configured); } catch { setIsSetup(true); } finally { setChecking(false); } })();
    }, []);
    useEffect(() => { if (!checking) ref.current?.focus(); }, [checking]);

    const setup = async () => {
        setErr(""); if (pin.length < 4) { setErr("PIN must be 4+ digits"); return; }
        if (pin !== pinC) { setErr("PINs do not match"); return; }
        setBusy(true);
        try {
            const kp = await generateECDHKeypair();
            const pub = await exportPubKey(kp.publicKey); const priv = await exportPrivKey(kp.privateKey);
            const wk = await pinToWrappingKey(pin);
            const { encPrivKey, keyIv } = await encryptPrivateKey(priv, wk);
            const ph = await bcrypt.hash(pin, 12);
            const r = await fetch("/api/admin/chats/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pubKey: pub, encPrivKey, keyIv, pinHash: ph }) });
            if (!r.ok) { setErr("Failed to save"); return; }
            onUnlock(kp.privateKey);
        } catch (e) { console.error(e); setErr("Setup failed"); } finally { setBusy(false); }
    };

    const unlock = async () => {
        setErr(""); if (pin.length < 4) { setErr("Enter PIN"); return; }
        setBusy(true);
        try {
            const r = await fetch("/api/admin/settings"); const raw = await r.json();
            const d = raw.settings || raw;
            const ep = d["admin_chat_enc_priv_key"], iv = d["admin_chat_key_iv"], ph = d["admin_chat_pin_hash"];
            if (!ep || !iv || !ph) { setErr("Keys incomplete"); setBusy(false); return; }
            if (!(await bcrypt.compare(pin, ph))) { setErr("Incorrect PIN"); setBusy(false); return; }
            const wk = await pinToWrappingKey(pin);
            onUnlock(await decryptPrivateKey(ep, iv, wk));
        } catch { setErr("Unlock failed"); } finally { setBusy(false); }
    };

    if (checking) return <div style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: t.bgPrimary }}><Loader2 style={{ width: 24, height: 24, color: t.accentPrimary, animation: "spin 1s linear infinite" }} /></div>;

    return (
        <div style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: t.bgPrimary }}>
            <div style={{ width: 380, padding: "36px 32px", background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow, textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: isSetup ? t.accentPrimaryMuted : t.statusWarningBg, border: `2px solid ${isSetup ? t.accentPrimary : t.statusWarning}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                    <KeyRound style={{ width: 24, height: 24, color: isSetup ? t.accentPrimary : t.statusWarning }} />
                </div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: t.textPrimary, marginBottom: 6 }}>{isSetup ? "Setup Encrypted Chat" : "Admin PIN Required"}</h2>
                <p style={{ fontSize: "0.8rem", color: t.textMuted, marginBottom: 24, lineHeight: 1.5 }}>{isSetup ? "Create a PIN to generate your admin ECDH keypair." : "Enter your admin PIN to decrypt your private key."}</p>
                <form onSubmit={e => { e.preventDefault(); isSetup ? setup() : unlock(); }}>
                    <div style={{ position: "relative", marginBottom: 12 }}>
                        <input ref={ref} type={show ? "text" : "password"} value={pin} onChange={e => setPin(e.target.value)} placeholder={isSetup ? "Create PIN (4+)" : "Enter PIN"} autoComplete="off" style={{ width: "100%", boxSizing: "border-box", padding: "11px 40px 11px 14px", background: t.bgInput, border: `1px solid ${err ? t.statusError : t.borderPrimary}`, borderRadius: t.cardRadius, color: t.textPrimary, fontSize: "0.95rem", outline: "none", fontFamily: t.fontMono, letterSpacing: "0.12em", textAlign: "center" }} />
                        <button type="button" onClick={() => setShow(s => !s)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t.textMuted, cursor: "pointer", display: "flex" }}>{show ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}</button>
                    </div>
                    {isSetup && <input type={show ? "text" : "password"} value={pinC} onChange={e => setPinC(e.target.value)} placeholder="Confirm PIN" style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, color: t.textPrimary, fontSize: "0.95rem", outline: "none", fontFamily: t.fontMono, letterSpacing: "0.12em", textAlign: "center", marginBottom: 12 }} />}
                    {err && <p style={{ fontSize: "0.75rem", color: t.statusError, marginBottom: 12 }}>{err}</p>}
                    <button type="submit" disabled={!pin || busy} style={{ width: "100%", padding: "11px", borderRadius: t.buttonRadius, border: "none", background: !pin || busy ? t.bgSecondary : (isSetup ? t.accentPrimary : t.statusWarning), color: !pin || busy ? t.textMuted : (isSetup ? "#fff" : "#000"), fontWeight: 800, fontSize: "0.875rem", cursor: !pin || busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        {busy ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Unlock style={{ width: 15, height: 15 }} />}
                        {busy ? "Working..." : isSetup ? "Generate Keys & Unlock" : "Unlock Chat"}
                    </button>
                </form>
                <p style={{ marginTop: 16, fontSize: "0.68rem", color: t.textMuted, lineHeight: 1.5 }}>{isSetup ? "Keypair encrypted with this PIN and stored securely." : "PIN decrypts your key locally. Never leaves the browser."}</p>
            </div>
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function AdminChatsPage() {
    const t = useThemeTokens();
    const [chats, setChats] = useState<ChatThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<ChatDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [toggling, setToggling] = useState(false);

    // ECDH state — adminPrivKey is the decrypted admin ECDH private key
    const [adminPrivKey, setAdminPrivKey] = useState<CryptoKey | null>(null);
    const [chatSharedKey, setChatSharedKey] = useState<CryptoKey | null>(null);
    const [decryptedMsgs, setDecryptedMsgs] = useState<Record<string, string | null>>({});
    const [decrypting, setDecrypting] = useState(false);

    const [replyInput, setReplyInput] = useState("");
    const [replySending, setReplySending] = useState(false);
    const [userTyping, setUserTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeout = useRef<ReturnType<typeof setTimeout>>(null);

    const loadChats = useCallback(async () => {
        setLoading(true);
        try { const r = await fetch("/api/admin/chats"); if (r.ok) setChats(await r.json()); } catch {}
        finally { setLoading(false); }
    }, []);
    useEffect(() => { loadChats(); }, [loadChats]);

    const loadDetail = useCallback(async (chatId: string) => {
        setDetailLoading(true); setDecryptedMsgs({}); setChatSharedKey(null);
        try { const r = await fetch(`/api/admin/chats/${chatId}`); if (r.ok) setDetail(await r.json()); } catch {}
        finally { setDetailLoading(false); }
    }, []);

    // Derive per-chat shared key + decrypt when detail loads
    useEffect(() => {
        if (!adminPrivKey || !detail?.userPubKey) return;
        setDecrypting(true);
        (async () => {
            try {
                const shared = await deriveSharedKey(adminPrivKey, detail.userPubKey);
                setChatSharedKey(shared);
                const results: Record<string, string | null> = {};
                await Promise.all(detail.messages.map(async msg => {
                    results[msg.id] = await decryptMessage(shared, msg.ciphertext, msg.iv);
                }));
                setDecryptedMsgs(results);
            } catch (e) { console.error("Decrypt failed:", e); }
            finally { setDecrypting(false); }
        })();
    }, [adminPrivKey, detail]);

    const selectChat = (chatId: string) => { setSelectedId(chatId); setDecryptedMsgs({}); loadDetail(chatId); };

    const closeChat = async () => {
        if (!detail) return;
        setToggling(true);
        try {
            const r = await fetch(`/api/admin/chats/${detail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ closed: true }) });
            if (r.ok) { setDetail(prev => prev ? { ...prev, closed: true, messages: [] } : null); setDecryptedMsgs({}); loadChats(); }
        } catch {} finally { setToggling(false); }
    };

    const handleUnlock = (pk: CryptoKey) => { setAdminPrivKey(pk); };
    const handleLock = () => { setAdminPrivKey(null); setChatSharedKey(null); setDecryptedMsgs({}); };

    const sendAdminReply = async () => {
        if (!replyInput.trim() || !chatSharedKey || !detail || replySending) return;
        setReplySending(true);
        fetch("/api/mmo/chat/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: detail.id, typing: false }) }).catch(() => {});
        try {
            const encrypted = await encryptMessage(chatSharedKey, replyInput.trim());
            const r = await fetch("/api/mmo/chat/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...encrypted, chatId: detail.id }) });
            if (r.ok) {
                const msg = await r.json();
                setDetail(prev => prev ? { ...prev, messages: [...prev.messages, msg] } : null);
                setDecryptedMsgs(prev => ({ ...prev, [msg.id]: replyInput.trim() }));
                setReplyInput("");
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            }
        } catch {} finally { setReplySending(false); }
    };

    const signalAdminTyping = (val: string) => {
        setReplyInput(val);
        if (!chatSharedKey || !detail) return;
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        if (val.trim()) {
            fetch("/api/mmo/chat/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: detail.id, typing: true }) }).catch(() => {});
            typingTimeout.current = setTimeout(() => {
                fetch("/api/mmo/chat/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: detail.id, typing: false }) }).catch(() => {});
            }, 3000);
        } else {
            fetch("/api/mmo/chat/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: detail.id, typing: false }) }).catch(() => {});
        }
    };

    // Auto-refresh: poll for new messages + typing every 3s
    useEffect(() => {
        if (!adminPrivKey || !detail) return;
        const iv = setInterval(async () => {
            try {
                const r = await fetch(`/api/admin/chats/${detail.id}`);
                if (!r.ok) return;
                const data: ChatDetail = await r.json();

                // If userPubKey or closed status changed, replace entire detail
                // This triggers re-derivation of shared key via the other useEffect
                if (data.userPubKey !== detail.userPubKey || data.closed !== detail.closed) {
                    setDetail(data);
                    setDecryptedMsgs({});
                    setChatSharedKey(null);
                    return;
                }

                // Otherwise just append new messages
                if (chatSharedKey) {
                    const knownIds = new Set(detail.messages.map(m => m.id));
                    const newMsgs = data.messages.filter(m => !knownIds.has(m.id));
                    if (newMsgs.length > 0) {
                        const results: Record<string, string | null> = {};
                        await Promise.all(newMsgs.map(async msg => { results[msg.id] = await decryptMessage(chatSharedKey, msg.ciphertext, msg.iv); }));
                        setDetail(prev => prev ? { ...prev, messages: [...prev.messages, ...newMsgs] } : null);
                        setDecryptedMsgs(prev => ({ ...prev, ...results }));
                        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
                    }
                }
                // Typing
                const tr = await fetch(`/api/mmo/chat/typing?chatId=${detail.id}`);
                const td = await tr.json();
                setUserTyping(td.typing === true);
            } catch {}
        }, 3000);
        return () => clearInterval(iv);
    }, [adminPrivKey, detail, chatSharedKey]);

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary, position: "relative" }}>
            {!adminPrivKey && <PinGate onUnlock={handleUnlock} t={t} />}

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
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {adminPrivKey && (
                            <button onClick={handleLock} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.cardRadius, border: `1px solid ${t.statusSuccess}44`, background: t.statusSuccessBg, color: t.statusSuccess, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}>
                                <Unlock style={{ width: 13, height: 13 }} /> Session Unlocked — Lock
                            </button>
                        )}
                        <button onClick={loadChats} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                            <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* Two-column layout */}
            <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, height: "calc(100vh - 200px)" }}>
                {/* Chat List */}
                <div style={{ ...card, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>Conversations</span>
                        <span style={{ padding: "2px 8px", borderRadius: 8, background: t.accentPrimaryMuted, color: t.accentPrimary, fontSize: "0.7rem", fontWeight: 700 }}>{chats.length}</span>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        {loading ? <div style={{ padding: 24, textAlign: "center", color: t.textMuted }}>Loading...</div>
                        : chats.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: t.textMuted, fontSize: "0.85rem" }}>No chat threads yet.</div>
                        : chats.map(chat => (
                            <div key={chat.id} onClick={() => selectChat(chat.id)} style={{ padding: "14px 18px", cursor: "pointer", borderBottom: `1px solid ${t.borderSecondary}`, background: selectedId === chat.id ? t.accentPrimaryMuted : "transparent", transition: "background 0.1s" }}
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
                                        </div>
                                    </div>
                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                        <p style={{ fontSize: "0.65rem", color: t.textMuted }}>{new Date(chat.lastMessageAt).toLocaleDateString()}</p>
                                        <ChevronRight style={{ width: 12, height: 12, color: t.textMuted, marginTop: 2 }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Chat Detail */}
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
                                            <Lock style={{ width: 9, height: 9 }} /> ECDH E2EE &mdash; {detail.messages.length} messages
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    {!detail.closed && (
                                        <button onClick={closeChat} disabled={toggling} style={{ padding: "5px 12px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: t.statusErrorBg, color: t.statusError, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer" }}>
                                            {toggling ? "Closing..." : "Close Permanently"}
                                        </button>
                                    )}
                                    {detail.closed && <span style={{ fontSize: "0.7rem", padding: "3px 8px", borderRadius: 4, background: t.statusErrorBg, color: t.statusError, fontWeight: 700 }}>Permanently Closed</span>}
                                </div>
                            </div>

                            {/* Messages */}
                            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                                {decrypting && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", color: t.textMuted, fontSize: "0.8rem" }}><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Decrypting messages...</div>}
                                {detail.messages.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: "40px 0", color: t.textMuted }}>
                                        <MessageCircle style={{ width: 32, height: 32, opacity: 0.3, margin: "0 auto 12px" }} />
                                        <p style={{ fontSize: "0.85rem" }}>{detail.closed ? "All messages were deleted when this chat was closed." : "No messages in this thread."}</p>
                                    </div>
                                ) : detail.messages.map(msg => {
                                    const plain = decryptedMsgs[msg.id];
                                    const isAdmin = msg.senderType === "ADMIN";
                                    const text = plain ?? "[Encrypted message]";
                                    const isEnc = plain === null || plain === undefined;
                                    return (
                                        <div key={msg.id} style={{ alignSelf: isAdmin ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                                            <div style={{ padding: "10px 14px", borderRadius: 14, background: isAdmin ? (t.isMono ? t.accentPrimary : "linear-gradient(135deg,#3b82f6,#2563eb)") : t.bgSecondary, color: isAdmin ? (t.isMono ? t.bgPrimary : "#fff") : t.textPrimary, border: isAdmin ? "none" : `1px solid ${t.borderSecondary}`, opacity: isEnc && !decrypting ? 0.55 : 1 }}>
                                                <p style={{ fontSize: "0.82rem", lineHeight: 1.5, wordBreak: "break-word", fontFamily: isEnc ? t.fontMono : t.fontFamily }}>{text}</p>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                                                {isEnc ? <Lock style={{ width: 8, height: 8, color: t.textMuted }} /> : <Unlock style={{ width: 8, height: 8, color: t.statusSuccess }} />}
                                                <p style={{ fontSize: "0.6rem", color: t.textMuted }}>{msg.senderType} &mdash; {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                                {userTyping && (
                                    <div style={{ alignSelf: "flex-start", maxWidth: "75%" }}>
                                        <div style={{ padding: "8px 14px", borderRadius: 14, background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 4 }}>
                                            <span style={{ fontSize: "0.78rem", color: t.textMuted, fontStyle: "italic" }}>User is typing</span>
                                            <span style={{ animation: "pulse 1.4s infinite", fontSize: "0.9rem", color: t.textMuted }}>...</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Reply Input */}
                            {adminPrivKey && !detail.closed && (
                                <div style={{ padding: "12px 20px", borderTop: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 8 }}>
                                    <input value={replyInput} onChange={e => signalAdminTyping(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAdminReply(); } }} placeholder="Type a reply..." style={{ flex: 1, padding: "10px 14px", borderRadius: 20, background: t.bgInput, border: `1px solid ${t.borderPrimary}`, color: t.textPrimary, fontSize: "0.85rem", fontFamily: t.fontFamily, outline: "none" }} />
                                    <button onClick={sendAdminReply} disabled={!replyInput.trim() || replySending} style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: replyInput.trim() ? t.accentPrimary : t.bgTertiary, color: replyInput.trim() ? (t.isMono ? t.bgPrimary : "#fff") : t.textMuted, cursor: replyInput.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        {replySending ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 16, height: 16 }} />}
                                    </button>
                                </div>
                            )}

                            {/* Footer */}
                            <div style={{ padding: "10px 20px", borderTop: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 8 }}>
                                {adminPrivKey
                                    ? <><Unlock style={{ width: 12, height: 12, color: t.statusSuccess }} /><p style={{ fontSize: "0.72rem", color: t.statusSuccess }}>Session unlocked — ECDH decryption active.</p></>
                                    : <><Lock style={{ width: 12, height: 12, color: t.statusWarning }} /><p style={{ fontSize: "0.72rem", color: t.textMuted }}>Enter Admin PIN to decrypt messages.</p></>}
                            </div>
                        </>
                    ) : null}
                </div>
            </div>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
        </div>
    );
}
