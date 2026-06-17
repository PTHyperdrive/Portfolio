"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    MessageCircle, X, Send, Lock, KeyRound, Loader2, Shield,
    Headphones, LogIn, HelpCircle
} from "lucide-react";
import {
    pinToWrappingKey, generateECDHKeypair, exportPubKey, exportPrivKey,
    encryptPrivateKey, decryptPrivateKey, deriveSharedKey,
    encryptMessage, decryptMessage,
} from "@/lib/chatCrypto";

type ChatMessage = {
    id: string; senderType: string; ciphertext: string; iv: string; createdAt: string;
    decrypted?: string;
};

const EXCLUDED_PREFIXES = ["/adminsystemnrsp", "/console-window", "/auth"];

export default function ContactSalesWidget() {
    const t = useThemeTokens();
    const pathname = usePathname() ?? "";
    const { status: authStatus } = useSession();
    const isAuthenticated = authStatus === "authenticated";

    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState<"auth-gate" | "pin-setup" | "pin-unlock" | "chat">("auth-gate");
    const [pin, setPin] = useState("");
    const [pinConfirm, setPinConfirm] = useState("");
    const [pinErr, setPinErr] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
    const [chatClosed, setChatClosed] = useState(false);
    const [adminTyping, setAdminTyping] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const typingTimeout = useRef<ReturnType<typeof setTimeout>>(null);

    const openWidget = async () => {
        setOpen(true);
        if (!isAuthenticated) { setPhase("auth-gate"); return; }
        setLoading(true);
        try {
            const res = await fetch("/api/mmo/chat");
            const data = await res.json();
            if (data.exists && !data.closed) setPhase("pin-unlock");
            else if (data.exists && data.closed) { setChatClosed(true); setPhase("pin-setup"); }
            else setPhase("pin-setup");
        } catch { /* noop */ }
        finally { setLoading(false); }
    };

    const handlePinSetup = async () => {
        setPinErr("");
        if (pin.length < 4) { setPinErr("PIN must be at least 4 digits"); return; }
        if (pin !== pinConfirm) { setPinErr("PINs do not match"); return; }
        setLoading(true);
        try {
            const kp = await generateECDHKeypair();
            const pubJwk = await exportPubKey(kp.publicKey);
            const privJwk = await exportPrivKey(kp.privateKey);
            const wrappingKey = await pinToWrappingKey(pin);
            const { encPrivKey, keyIv } = await encryptPrivateKey(privJwk, wrappingKey);
            const res = await fetch("/api/mmo/chat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin, userPubKey: pubJwk, userEncPrivKey: encPrivKey, userKeyIv: keyIv }),
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); setPinErr(d.error || "Failed to create chat"); return; }
            const { adminPubKey } = await res.json();
            const shared = await deriveSharedKey(kp.privateKey, adminPubKey);
            setSharedKey(shared); setChatClosed(false); setPhase("chat"); setMessages([]);
        } catch (err) { console.error(err); setPinErr("Encryption setup failed"); }
        finally { setLoading(false); }
    };

    const handlePinUnlock = async () => {
        setPinErr("");
        if (pin.length < 4) { setPinErr("Enter your PIN"); return; }
        setLoading(true);
        try {
            const pinRes = await fetch("/api/mmo/chat/verify-pin", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin }),
            });
            if (pinRes.status === 429) { const d = await pinRes.json().catch(() => ({})); setPinErr(d.error || "Too many attempts."); setLoading(false); return; }
            if (pinRes.status === 403) { setPinErr("Incorrect PIN"); setLoading(false); return; }
            if (!pinRes.ok) { const d = await pinRes.json().catch(() => ({})); setPinErr(d.error || "Verification failed"); setLoading(false); return; }
            const pinData = await pinRes.json();
            if (!pinData.verified) { setPinErr("Incorrect PIN"); setLoading(false); return; }
            const wrappingKey = await pinToWrappingKey(pin);
            const userPrivKey = await decryptPrivateKey(pinData.userEncPrivKey, pinData.userKeyIv, wrappingKey);
            const chatRes = await fetch("/api/mmo/chat");
            const chatData = await chatRes.json();
            if (!chatData.exists) { setPhase("pin-setup"); return; }
            if (chatData.closed) { setChatClosed(true); setPhase("pin-setup"); return; }
            if (!chatData.adminPubKey) { setPinErr("Admin chat not configured yet"); setLoading(false); return; }
            const shared = await deriveSharedKey(userPrivKey, chatData.adminPubKey);
            setSharedKey(shared);
            const decrypted = await Promise.all(
                chatData.messages.map(async (msg: ChatMessage) => {
                    try { const plaintext = await decryptMessage(shared, msg.ciphertext, msg.iv); return { ...msg, decrypted: plaintext ?? "[Unable to decrypt]" }; }
                    catch { return { ...msg, decrypted: "[Unable to decrypt]" }; }
                })
            );
            setMessages(decrypted); setPhase("chat");
        } catch (err) { console.error(err); setPinErr("Unlock failed"); }
        finally { setLoading(false); }
    };

    const sendMsg = async () => {
        if (!input.trim() || !sharedKey || sending) return;
        setSending(true);
        fetch("/api/mmo/chat/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typing: false }) }).catch(() => {});
        try {
            const encrypted = await encryptMessage(sharedKey, input.trim());
            const res = await fetch("/api/mmo/chat/message", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(encrypted),
            });
            if (res.ok) {
                const msg = await res.json();
                setMessages(prev => [...prev, { ...msg, decrypted: input.trim() }]);
                setInput("");
                setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            }
        } catch { /* silent */ }
        finally { setSending(false); }
    };

    const signalTyping = (val: string) => {
        setInput(val);
        if (!sharedKey || phase !== "chat") return;
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        if (val.trim()) {
            fetch("/api/mmo/chat/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typing: true }) }).catch(() => {});
            typingTimeout.current = setTimeout(() => {
                fetch("/api/mmo/chat/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typing: false }) }).catch(() => {});
            }, 3000);
        } else {
            fetch("/api/mmo/chat/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typing: false }) }).catch(() => {});
        }
    };

    // Poll for new messages + typing every 3s
    useEffect(() => {
        if (phase !== "chat" || !sharedKey || !open) return;
        const iv = setInterval(async () => {
            try {
                const res = await fetch("/api/mmo/chat");
                const data = await res.json();
                if (data.exists && data.messages) {
                    const serverMsgs: ChatMessage[] = data.messages;
                    const decryptedNew = await Promise.all(serverMsgs.map(async (msg: ChatMessage) => {
                        try { return { ...msg, decrypted: await decryptMessage(sharedKey, msg.ciphertext, msg.iv) ?? "[Unable to decrypt]" }; }
                        catch { return { ...msg, decrypted: "[Unable to decrypt]" }; }
                    }));
                    setMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id));
                        const newOnly = decryptedNew.filter(m => !existingIds.has(m.id));
                        if (newOnly.length === 0) return prev;
                        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
                        return [...prev, ...newOnly];
                    });
                }
                const tr = await fetch("/api/mmo/chat/typing");
                const td = await tr.json();
                setAdminTyping(td.typing === true);
            } catch { /* silent */ }
        }, 3000);
        return () => clearInterval(iv);
    }, [phase, sharedKey, open]);

    // Hide on excluded routes (must be after all hooks per Rules of Hooks)
    const isExcluded = EXCLUDED_PREFIXES.some(p => pathname.startsWith(p));
    if (isExcluded) return null;

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };

    // ── FAB ──
    if (!open) return (
        <button
            id="contact-sales-fab"
            onClick={openWidget}
            style={{
                position: "fixed", bottom: 28, right: 28,
                width: 56, height: 56, borderRadius: "50%", border: "none",
                background: t.isMono ? t.accentPrimary : "linear-gradient(135deg,#3b82f6,#6366f1)",
                color: "#fff", cursor: "pointer",
                boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
                zIndex: 9000, transition: "transform 0.15s, box-shadow 0.15s",
                animation: "chatFabPulse 3s ease-in-out infinite",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = "0 6px 32px rgba(59,130,246,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.35)"; }}
            title="Contact Sales"
        >
            <MessageCircle style={{ width: 24, height: 24 }} />
        </button>
    );

    // ── Chat Panel ──
    return (
        <div id="contact-sales-panel" style={{
            position: "fixed", bottom: 28, right: 28,
            width: 400, height: 560, zIndex: 9000,
            ...card, display: "flex", flexDirection: "column",
            overflow: "hidden", boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
            animation: "chatWidgetSlideUp 0.25s ease-out",
        }}>
            {/* Header */}
            <div style={{
                padding: "18px 20px", borderBottom: `1px solid ${t.borderSecondary}`,
                background: t.isMono ? t.bgSecondary : "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.08))",
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: "50%",
                            background: t.isMono ? t.accentPrimaryMuted : "linear-gradient(135deg,#3b82f6,#6366f1)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <Headphones style={{ width: 18, height: 18, color: t.isMono ? t.accentPrimary : "#fff" }} />
                        </div>
                        <div>
                            <p style={{ fontWeight: 800, fontSize: "0.95rem", color: t.textPrimary }}>Contact Sales</p>
                            <p style={{ fontSize: "0.65rem", color: t.statusSuccess, display: "flex", alignItems: "center", gap: 4 }}>
                                <Shield style={{ width: 9, height: 9 }} /> End-to-end encrypted
                            </p>
                        </div>
                    </div>
                    <button onClick={() => setOpen(false)} style={{
                        width: 28, height: 28, borderRadius: "50%", border: `1px solid ${t.borderPrimary}`,
                        background: "transparent", color: t.textMuted, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}><X style={{ width: 13, height: 13 }} /></button>
                </div>
                <p style={{ fontSize: "1.05rem", fontWeight: 800, color: t.textPrimary, lineHeight: 1.3 }}>
                    <HelpCircle style={{ width: 16, height: 16, display: "inline", verticalAlign: "middle", marginRight: 6, color: t.accentPrimary }} />
                    Hello there. How can we help you?
                </p>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {loading ? (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Loader2 style={{ width: 24, height: 24, color: t.accentPrimary, animation: "spin 1s linear infinite" }} />
                    </div>
                ) : phase === "auth-gate" ? (
                    /* Auth Gate */
                    <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16, textAlign: "center" }}>
                        <LogIn style={{ width: 40, height: 40, color: t.accentPrimary, margin: "0 auto", opacity: 0.8 }} />
                        <h3 style={{ fontWeight: 800, fontSize: "1.05rem", color: t.textPrimary }}>Sign in to chat</h3>
                        <p style={{ fontSize: "0.82rem", color: t.textMuted, lineHeight: 1.5 }}>
                            Create an account or sign in to start an encrypted conversation with our team.
                        </p>
                        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                            <Link href="/auth/register" style={{
                                flex: 1, padding: "12px 0", borderRadius: t.buttonRadius, textDecoration: "none",
                                background: t.accentPrimary, color: t.isMono ? t.bgPrimary : "#fff",
                                fontWeight: 700, fontSize: "0.88rem", textAlign: "center",
                            }}>Create Account</Link>
                            <Link href="/auth/login" style={{
                                flex: 1, padding: "12px 0", borderRadius: t.buttonRadius, textDecoration: "none",
                                background: "transparent", color: t.textSecondary, border: `1px solid ${t.borderPrimary}`,
                                fontWeight: 600, fontSize: "0.88rem", textAlign: "center",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            }}><LogIn style={{ width: 14, height: 14 }} /> Log In</Link>
                        </div>
                    </div>
                ) : phase === "pin-setup" ? (
                    /* PIN Setup */
                    <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
                        <div style={{ textAlign: "center", marginBottom: 4 }}>
                            <KeyRound style={{ width: 32, height: 32, color: t.accentPrimary, margin: "0 auto 10px" }} />
                            <h3 style={{ fontWeight: 800, fontSize: "1rem", color: t.textPrimary }}>Set Your Chat PIN</h3>
                            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>
                                This PIN protects your encrypted chat. It cannot be recovered.
                            </p>
                        </div>
                        <div>
                            <label style={{ fontSize: "0.7rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" }}>Create PIN</label>
                            <input type="password" inputMode="numeric" maxLength={8} value={pin}
                                onChange={e => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Enter 4+ digit PIN"
                                style={{ width: "100%", padding: "10px 14px", boxSizing: "border-box", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "1.1rem", fontFamily: t.fontMono, textAlign: "center", letterSpacing: "0.3em", outline: "none" }} />
                        </div>
                        <div>
                            <label style={{ fontSize: "0.7rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" }}>Confirm PIN</label>
                            <input type="password" inputMode="numeric" maxLength={8} value={pinConfirm}
                                onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ""))} placeholder="Re-enter PIN"
                                onKeyDown={e => { if (e.key === "Enter") handlePinSetup(); }}
                                style={{ width: "100%", padding: "10px 14px", boxSizing: "border-box", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "1.1rem", fontFamily: t.fontMono, textAlign: "center", letterSpacing: "0.3em", outline: "none" }} />
                        </div>
                        {pinErr && <p style={{ fontSize: "0.78rem", color: t.statusError, textAlign: "center" }}>{pinErr}</p>}
                        <button onClick={handlePinSetup} style={{
                            padding: "11px 0", borderRadius: t.buttonRadius, background: t.accentPrimary,
                            color: t.isMono ? t.bgPrimary : "#fff", fontWeight: 700, fontSize: "0.88rem",
                            border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}><Lock style={{ width: 14, height: 14 }} /> Initialize Encrypted Chat</button>
                    </div>
                ) : phase === "pin-unlock" ? (
                    /* PIN Unlock */
                    <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
                        <div style={{ textAlign: "center", marginBottom: 4 }}>
                            <Lock style={{ width: 32, height: 32, color: t.accentPrimary, margin: "0 auto 10px" }} />
                            <h3 style={{ fontWeight: 800, fontSize: "1rem", color: t.textPrimary }}>Unlock Chat</h3>
                            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 4 }}>Enter your PIN to access encrypted messages.</p>
                        </div>
                        <input type="password" inputMode="numeric" maxLength={8} value={pin}
                            onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
                            onKeyDown={e => { if (e.key === "Enter") handlePinUnlock(); }}
                            placeholder="Enter PIN"
                            style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "1.3rem", fontFamily: t.fontMono, textAlign: "center", letterSpacing: "0.3em", outline: "none" }} />
                        {pinErr && <p style={{ fontSize: "0.78rem", color: t.statusError, textAlign: "center" }}>{pinErr}</p>}
                        <button onClick={handlePinUnlock} style={{
                            padding: "11px 0", borderRadius: t.buttonRadius, background: t.accentPrimary,
                            color: t.isMono ? t.bgPrimary : "#fff", fontWeight: 700, fontSize: "0.88rem",
                            border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}><KeyRound style={{ width: 14, height: 14 }} /> Unlock</button>
                    </div>
                ) : (
                    /* Chat Messages */
                    <>
                        <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                            {messages.length === 0 && (
                                <div style={{ textAlign: "center", padding: "40px 0" }}>
                                    <MessageCircle style={{ width: 32, height: 32, color: t.textMuted, opacity: 0.3, margin: "0 auto 12px" }} />
                                    <p style={{ fontSize: "0.82rem", color: t.textMuted }}>No messages yet. Start the conversation.</p>
                                </div>
                            )}
                            {messages.map(msg => (
                                <div key={msg.id} style={{ alignSelf: msg.senderType === "USER" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                                    <div style={{
                                        padding: "10px 14px", borderRadius: 14,
                                        background: msg.senderType === "USER"
                                            ? (t.isMono ? t.accentPrimary : "linear-gradient(135deg,#3b82f6,#2563eb)")
                                            : t.bgSecondary,
                                        color: msg.senderType === "USER" ? (t.isMono ? t.bgPrimary : "#fff") : t.textPrimary,
                                        border: msg.senderType === "USER" ? "none" : `1px solid ${t.borderSecondary}`,
                                    }}>
                                        <p style={{ fontSize: "0.82rem", lineHeight: 1.5, wordBreak: "break-word" }}>{msg.decrypted || "[Encrypted]"}</p>
                                    </div>
                                    <p style={{ fontSize: "0.6rem", color: t.textMuted, marginTop: 3, textAlign: msg.senderType === "USER" ? "right" : "left" }}>
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                </div>
                            ))}
                            <div ref={endRef} />
                            {adminTyping && (
                                <div style={{ alignSelf: "flex-start", maxWidth: "80%" }}>
                                    <div style={{ padding: "8px 14px", borderRadius: 14, background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 4 }}>
                                        <span style={{ fontSize: "0.78rem", color: t.textMuted, fontStyle: "italic" }}>Admin is typing</span>
                                        <span style={{ animation: "pulse 1.4s infinite", fontSize: "0.9rem", color: t.textMuted }}>...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Input */}
                        <div style={{ padding: "12px 14px", borderTop: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 8 }}>
                            <input value={input} onChange={e => signalTyping(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                                placeholder="Type a message..."
                                style={{ flex: 1, padding: "10px 14px", borderRadius: 20, background: t.bgInput, border: `1px solid ${t.borderPrimary}`, color: t.textPrimary, fontSize: "0.85rem", fontFamily: t.fontFamily, outline: "none" }} />
                            <button onClick={sendMsg} disabled={!input.trim() || sending} style={{
                                width: 38, height: 38, borderRadius: "50%", border: "none",
                                background: input.trim() ? t.accentPrimary : t.bgTertiary,
                                color: input.trim() ? (t.isMono ? t.bgPrimary : "#fff") : t.textMuted,
                                cursor: input.trim() ? "pointer" : "not-allowed",
                                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
                            }}>
                                {sending ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 16, height: 16 }} />}
                            </button>
                        </div>
                        {/* E2EE Footer */}
                        <div style={{ padding: "8px 14px", borderTop: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 6 }}>
                            <Lock style={{ width: 10, height: 10, color: t.statusSuccess }} />
                            <p style={{ fontSize: "0.65rem", color: t.textMuted }}>Messages are end-to-end encrypted. Only you and the admin can read them.</p>
                        </div>
                    </>
                )}
            </div>

            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
        </div>
    );
}
