"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    MessagesSquare, RefreshCw, User, Lock, Shield, Unlock,
    X, MessageCircle, ChevronRight, Loader2, ToggleLeft, ToggleRight, KeyRound, Eye, EyeOff
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// ECDH / AES-GCM crypto helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Derive a 256-bit AES-GCM key from a PIN string via PBKDF2. */
async function pinToKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );
}

/** Try to decrypt a base64 ciphertext with AES-GCM key + base64 IV. Returns plaintext or null on failure. */
async function decryptMsg(ciphertextB64: string, ivB64: string, key: CryptoKey): Promise<string | null> {
    try {
        const ct = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
        return new TextDecoder().decode(plain);
    } catch {
        return null;
    }
}

// Fixed salt derived from the admin domain — matches the salt used on the client side.
// In production this should be stored alongside the key. Here we use a deterministic
// site-specific constant so no extra storage is required.
const ADMIN_SALT = new TextEncoder().encode("notrespond-admin-salt-v1");

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// PIN Gate Component
// ─────────────────────────────────────────────────────────────────────────────

function PinGate({ onUnlock, t }: { onUnlock: (key: CryptoKey) => void; t: ReturnType<typeof useThemeTokens> }) {
    const [pin, setPin] = useState("");
    const [showPin, setShowPin] = useState(false);
    const [error, setError] = useState("");
    const [working, setWorking] = useState(false);

    // Reset PIN flow
    const [resetStep, setResetStep] = useState<"idle" | "warn" | "confirm" | "done">("idle");
    const [resetWorking, setResetWorking] = useState(false);
    const [resetError, setResetError] = useState("");

    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.focus(); }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin) return;
        setWorking(true); setError("");
        try {
            const key = await pinToKey(pin, ADMIN_SALT);
            onUnlock(key);
        } catch {
            setError("Failed to derive key. Try again.");
        } finally {
            setWorking(false);
        }
    };

    const executeReset = async () => {
        setResetWorking(true); setResetError("");
        try {
            const res = await fetch("/api/admin/chats/messages", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirm: "RESET_PIN" }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || `HTTP ${res.status}`);
            }
            setResetStep("done");
            setPin("");
        } catch (e) {
            setResetError(e instanceof Error ? e.message : "Reset failed.");
        } finally {
            setResetWorking(false);
        }
    };

    // ── Reset confirmation modal ──────────────────────────────────────────────
    if (resetStep === "warn" || resetStep === "confirm") {
        return (
            <div style={{
                position: "absolute", inset: 0, zIndex: 50,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
            }}>
                <div style={{
                    width: 400, padding: "32px 28px",
                    background: t.bgCard, border: `1px solid ${t.statusError}55`,
                    borderRadius: t.cardRadius, boxShadow: t.shadow,
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: t.statusErrorBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <X style={{ width: 18, height: 18, color: t.statusError }} />
                        </div>
                        <h2 style={{ fontSize: "1rem", fontWeight: 800, color: t.statusError }}>Reset Admin PIN</h2>
                    </div>

                    <p style={{ fontSize: "0.84rem", color: t.textSecondary, lineHeight: 1.6, marginBottom: 12 }}>
                        This action will <strong style={{ color: t.statusError }}>permanently delete all encrypted chat messages</strong> across every thread.
                    </p>
                    <p style={{ fontSize: "0.84rem", color: t.textSecondary, lineHeight: 1.6, marginBottom: 20 }}>
                        Since the old PIN cannot be recovered, the only way to regain access is to purge the ciphertexts and start fresh. Chat threads will remain open — only messages are deleted.
                    </p>

                    {resetStep === "warn" && (
                        <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={() => setResetStep("idle")} style={{ flex: 1, padding: "9px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 700, fontSize: "0.84rem", cursor: "pointer" }}>
                                Cancel
                            </button>
                            <button onClick={() => setResetStep("confirm")} style={{ flex: 1, padding: "9px", borderRadius: t.buttonRadius, border: "none", background: t.statusErrorBg, color: t.statusError, fontWeight: 800, fontSize: "0.84rem", cursor: "pointer" }}>
                                I Understand, Continue
                            </button>
                        </div>
                    )}

                    {resetStep === "confirm" && (
                        <>
                            <div style={{ padding: "12px 16px", borderRadius: t.isMono ? 4 : 8, background: t.statusErrorBg, border: `1px solid ${t.statusError}44`, marginBottom: 16 }}>
                                <p style={{ fontSize: "0.8rem", color: t.statusError, fontWeight: 700 }}>Final confirmation — this cannot be undone.</p>
                            </div>
                            {resetError && <p style={{ fontSize: "0.75rem", color: t.statusError, marginBottom: 12 }}>{resetError}</p>}
                            <div style={{ display: "flex", gap: 10 }}>
                                <button onClick={() => setResetStep("idle")} style={{ flex: 1, padding: "9px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 700, fontSize: "0.84rem", cursor: "pointer" }}>
                                    Cancel
                                </button>
                                <button onClick={executeReset} disabled={resetWorking} style={{ flex: 1, padding: "9px", borderRadius: t.buttonRadius, border: "none", background: t.statusError, color: "#fff", fontWeight: 800, fontSize: "0.84rem", cursor: resetWorking ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                    {resetWorking ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
                                    {resetWorking ? "Deleting…" : "Delete All & Reset"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ── Main PIN gate ────────────────────────────────────────────────────────
    return (
        <div style={{
            position: "absolute", inset: 0, zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: t.bgPrimary,
        }}>
            <div style={{
                width: 360, padding: "36px 32px",
                background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
                borderRadius: t.cardRadius, boxShadow: t.shadow,
                textAlign: "center",
            }}>
                <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: resetStep === "done" ? t.statusSuccessBg : t.statusWarningBg,
                    border: `2px solid ${resetStep === "done" ? t.statusSuccess : t.statusWarning}44`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 20px",
                }}>
                    <KeyRound style={{ width: 24, height: 24, color: resetStep === "done" ? t.statusSuccess : t.statusWarning }} />
                </div>

                <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: t.textPrimary, marginBottom: 6 }}>
                    {resetStep === "done" ? "PIN Reset — Set New PIN" : "Admin PIN Required"}
                </h2>
                <p style={{ fontSize: "0.8rem", color: t.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
                    {resetStep === "done"
                        ? "All old messages have been deleted. Enter a new PIN — all future messages will be encrypted with it."
                        : "Messages are end-to-end encrypted. Enter your Admin PIN to decrypt this session."}
                </p>

                <form onSubmit={submit}>
                    <div style={{ position: "relative", marginBottom: 12 }}>
                        <input
                            ref={inputRef}
                            type={showPin ? "text" : "password"}
                            value={pin}
                            onChange={e => setPin(e.target.value)}
                            placeholder={resetStep === "done" ? "Set new Admin PIN…" : "Enter Admin PIN…"}
                            autoComplete="off"
                            style={{
                                width: "100%", boxSizing: "border-box" as const,
                                padding: "11px 40px 11px 14px",
                                background: t.bgInput, border: `1px solid ${error ? t.statusError : t.borderPrimary}`,
                                borderRadius: t.isMono ? 4 : 8,
                                color: t.textPrimary, fontSize: "0.95rem", outline: "none",
                                fontFamily: t.fontMono, letterSpacing: "0.12em",
                                textAlign: "center",
                            }}
                        />
                        <button type="button" onClick={() => setShowPin(s => !s)} style={{
                            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                            background: "none", border: "none", color: t.textMuted, cursor: "pointer",
                            display: "flex", alignItems: "center",
                        }}>
                            {showPin ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                        </button>
                    </div>

                    {error && <p style={{ fontSize: "0.75rem", color: t.statusError, marginBottom: 12 }}>{error}</p>}

                    <button type="submit" disabled={!pin || working} style={{
                        width: "100%", padding: "11px", borderRadius: t.buttonRadius, border: "none",
                        background: !pin || working ? t.bgSecondary : t.statusWarning,
                        color: !pin || working ? t.textMuted : "#000",
                        fontWeight: 800, fontSize: "0.875rem", cursor: !pin || working ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        transition: "background 0.15s",
                    }}>
                        {working ? <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> : <Unlock style={{ width: 15, height: 15 }} />}
                        {working ? "Unlocking…" : resetStep === "done" ? "Set PIN & Unlock" : "Unlock Chat"}
                    </button>
                </form>

                <p style={{ marginTop: 16, fontSize: "0.68rem", color: t.textMuted, lineHeight: 1.5 }}>
                    The PIN never leaves your browser. Decryption happens locally.
                </p>
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminChatsPage() {
    const t = useThemeTokens();
    const [chats, setChats] = useState<ChatThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<ChatDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [toggling, setToggling] = useState(false);

    // E2EE state
    const [decryptKey, setDecryptKey] = useState<CryptoKey | null>(null);
    const [decryptedMsgs, setDecryptedMsgs] = useState<Record<string, string | null>>({});
    const [decrypting, setDecrypting] = useState(false);

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
        setDecryptedMsgs({});
        try {
            const res = await fetch(`/api/admin/chats/${chatId}`);
            if (res.ok) setDetail(await res.json());
        } catch { /* silent */ }
        finally { setDetailLoading(false); }
    }, []);

    // When a key is available and a detail is loaded, decrypt all messages
    useEffect(() => {
        if (!decryptKey || !detail) return;
        setDecrypting(true);
        (async () => {
            const results: Record<string, string | null> = {};
            await Promise.all(detail.messages.map(async msg => {
                results[msg.id] = await decryptMsg(msg.ciphertext, msg.iv, decryptKey);
            }));
            setDecryptedMsgs(results);
            setDecrypting(false);
        })();
    }, [decryptKey, detail]);

    const selectChat = (chatId: string) => {
        setSelectedId(chatId);
        setDecryptedMsgs({});
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

    const handleUnlock = (key: CryptoKey) => {
        setDecryptKey(key);
    };

    const handleLock = () => {
        setDecryptKey(null);
        setDecryptedMsgs({});
    };

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary, position: "relative" }}>

            {/* PIN Gate Overlay — shown when no key is loaded */}
            {!decryptKey && (
                <PinGate onUnlock={handleUnlock} t={t} />
            )}

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
                        {/* Session lock indicator */}
                        {decryptKey && (
                            <button onClick={handleLock} title="Lock session" style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "7px 14px", borderRadius: t.isMono ? 4 : 8,
                                border: `1px solid ${t.statusSuccess}44`,
                                background: t.statusSuccessBg,
                                color: t.statusSuccess, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer",
                            }}>
                                <Unlock style={{ width: 13, height: 13 }} /> Session Unlocked — Lock
                            </button>
                        )}
                        <button onClick={loadChats} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
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
                                            <Lock style={{ width: 9, height: 9 }} /> E2EE &mdash; {detail.messages.length} messages
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    {/* Secret Chat Badge */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: t.isMono ? 4 : 8, background: detail.secretChatEligible ? t.bgTertiary : t.bgSecondary, border: `1px solid ${detail.secretChatEligible ? t.borderPrimary : t.borderSecondary}`, opacity: detail.secretChatEligible ? 1 : 0.5 }}>
                                        {detail.secretChatEligible ? <ToggleRight style={{ width: 16, height: 16, color: t.statusSuccess }} /> : <ToggleLeft style={{ width: 16, height: 16, color: t.textMuted }} />}
                                        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: detail.secretChatEligible ? t.statusSuccess : t.textMuted }}>Secret Chat</span>
                                    </div>
                                    {!detail.secretChatEligible && (
                                        <span style={{ fontSize: "0.6rem", color: t.textMuted, maxWidth: 120 }}>Available after 30 days</span>
                                    )}
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
                                {decrypting && (
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", color: t.textMuted, fontSize: "0.8rem" }}>
                                        <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                                        Decrypting messages…
                                    </div>
                                )}
                                {detail.messages.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: "40px 0", color: t.textMuted }}>
                                        <MessageCircle style={{ width: 32, height: 32, opacity: 0.3, margin: "0 auto 12px" }} />
                                        <p style={{ fontSize: "0.85rem" }}>No messages in this thread.</p>
                                    </div>
                                ) : (
                                    detail.messages.map(msg => {
                                        const plain = decryptedMsgs[msg.id];
                                        const isAdmin = msg.senderType === "ADMIN";
                                        const text = plain ?? "[Encrypted message]";
                                        const isEncrypted = plain === null || plain === undefined;

                                        return (
                                            <div key={msg.id} style={{ alignSelf: isAdmin ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                                                <div style={{
                                                    padding: "10px 14px", borderRadius: 14,
                                                    background: isAdmin
                                                        ? (t.isMono ? t.accentPrimary : "linear-gradient(135deg,#3b82f6,#2563eb)")
                                                        : t.bgSecondary,
                                                    color: isAdmin ? (t.isMono ? t.bgPrimary : "#fff") : t.textPrimary,
                                                    border: isAdmin ? "none" : `1px solid ${t.borderSecondary}`,
                                                    opacity: isEncrypted && !decrypting ? 0.55 : 1,
                                                }}>
                                                    <p style={{ fontSize: "0.82rem", lineHeight: 1.5, wordBreak: "break-word", fontFamily: isEncrypted ? t.fontMono : t.fontFamily }}>
                                                        {text}
                                                    </p>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                                                    {isEncrypted
                                                        ? <Lock style={{ width: 8, height: 8, color: t.textMuted }} />
                                                        : <Unlock style={{ width: 8, height: 8, color: t.statusSuccess }} />}
                                                    <p style={{ fontSize: "0.6rem", color: t.textMuted, textAlign: isAdmin ? "right" : "left" }}>
                                                        {msg.senderType} &mdash; {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Footer status */}
                            <div style={{ padding: "10px 20px", borderTop: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 8 }}>
                                {decryptKey
                                    ? <><Unlock style={{ width: 12, height: 12, color: t.statusSuccess }} /><p style={{ fontSize: "0.72rem", color: t.statusSuccess }}>Session unlocked — messages decrypted locally.</p></>
                                    : <><Lock style={{ width: 12, height: 12, color: t.statusWarning }} /><p style={{ fontSize: "0.72rem", color: t.textMuted }}>Messages are end-to-end encrypted. Enter Admin PIN to decrypt.</p></>
                                }
                            </div>
                        </>
                    ) : null}
                </div>
            </div>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
