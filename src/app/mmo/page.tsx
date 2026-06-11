"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useCredits } from "@/components/CreditProvider";
import {
    ShoppingBag, Package, Search, Grid3X3,
    ShoppingCart, LogIn, X, Minus, Plus, Copy, Check,
    Download, AlertTriangle, Clock, Layers,
    MessageCircle, Send, Lock, KeyRound, Loader2, Shield
} from "lucide-react";

/* ═══ Types ═══ */
type Category = {
    id: string; slug: string; name: string; description: string | null;
    imageUrl: string | null; fields: string[]; pricePerUnit: number; availableStock: number;
};
type PurchasedItem = { id: string; data: string; expiresAt: string };
type PurchaseResult = {
    success: boolean; category: string; fields: string[]; quantity: number;
    totalCost: number; expiresAt: string; items: PurchasedItem[];
};
type FilterState = {
    sortBy: string; priceMin: number; priceMax: number;
    stockFilter: string; selectedCategory: string;
};
type ChatMessage = {
    id: string; senderType: string; ciphertext: string; iv: string; createdAt: string;
    decrypted?: string;
};

const GRID_OPTIONS = [
    { label: "3", cols: 3 }, { label: "4", cols: 4 },
    { label: "5", cols: 5 }, { label: "6", cols: 6 },
] as const;

import {
    pinToWrappingKey, generateECDHKeypair, exportPubKey, exportPrivKey,
    encryptPrivateKey, decryptPrivateKey, deriveSharedKey,
    encryptMessage, decryptMessage,
} from "@/lib/chatCrypto";

/* ═══ Component ═══ */
export default function MmoStorePage() {
    const t = useThemeTokens();
    const { data: session, status: authStatus } = useSession();
    const isAuthenticated = authStatus === "authenticated";
    const isLoading = authStatus === "loading";
    const { credits: globalCredits, adjust: adjustCredits, refresh: refreshCredits } = useCredits();

    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [gridCols, setGridCols] = useState(4);

    // Purchase
    const [selectedCat, setSelectedCat] = useState<Category | null>(null);
    const [qty, setQty] = useState(1);
    const [purchasing, setPurchasing] = useState(false);
    const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
    const [purchaseErr, setPurchaseErr] = useState("");
    const [copied, setCopied] = useState(false);
    const [showAuthGate, setShowAuthGate] = useState(false);

    // Filters from sidebar
    const [filters, setFilters] = useState<FilterState>({
        sortBy: "default", priceMin: 0, priceMax: 10000,
        stockFilter: "all", selectedCategory: "all",
    });

    // ── Chat State ──
    const [chatOpen, setChatOpen] = useState(false);
    const [chatPhase, setChatPhase] = useState<"pin-setup" | "pin-unlock" | "chat">("pin-setup");
    const [chatPin, setChatPin] = useState("");
    const [chatPinConfirm, setChatPinConfirm] = useState("");
    const [chatPinErr, setChatPinErr] = useState("");
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const [chatSending, setChatSending] = useState(false);
    const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null); // ECDH-derived AES key
    const [chatClosed, setChatClosed] = useState(false);
    const [adminTyping, setAdminTyping] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const typingTimeout = useRef<ReturnType<typeof setTimeout>>(null);

    // ── Chat PIN Reset State ──
    const [chatResetStep, setChatResetStep] = useState<"idle" | "warn" | "confirm">("idle");
    const [chatResetting, setChatResetting] = useState(false);

    const handleChatReset = async () => {
        setChatResetting(true); setChatPinErr("");
        try {
            const res = await fetch("/api/mmo/chat/reset", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirm: "RESET_PIN" }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || `HTTP ${res.status}`);
            }
            setChatResetStep("idle");
            setChatPin(""); setChatPinConfirm(""); setChatPinErr("");
            setSharedKey(null); setChatMessages([]); setChatClosed(false);
            setChatPhase("pin-setup");
        } catch (e) {
            setChatPinErr(e instanceof Error ? e.message : "Reset failed. Try again.");
        } finally {
            setChatResetting(false);
        }
    };

    // Read filters from layout data attribute
    useEffect(() => {
        const readFilters = () => {
            const mainEl = document.querySelector("[data-mmo-filters]");
            if (mainEl) {
                try {
                    const f = JSON.parse(mainEl.getAttribute("data-mmo-filters") || "{}");
                    setFilters(f);
                } catch { /* noop */ }
            }
        };
        readFilters();
        const observer = new MutationObserver(readFilters);
        const mainEl = document.querySelector("[data-mmo-filters]");
        if (mainEl) observer.observe(mainEl, { attributes: true, attributeFilter: ["data-mmo-filters"] });
        return () => observer.disconnect();
    }, []);

    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch("/api/mmo");
            if (res.ok) setCategories(await res.json());
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchCategories(); }, [fetchCategories]);

    /* ─── Filter + Sort ─── */
    const displayed = useMemo(() => {
        let result = [...categories];
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(c => c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q));
        }
        if (filters.selectedCategory !== "all") {
            result = result.filter(c => c.id === filters.selectedCategory);
        }
        result = result.filter(c => c.pricePerUnit >= filters.priceMin && c.pricePerUnit <= filters.priceMax);
        if (filters.stockFilter === "in-stock") result = result.filter(c => c.availableStock > 0);
        switch (filters.sortBy) {
            case "price-asc": result.sort((a, b) => a.pricePerUnit - b.pricePerUnit); break;
            case "price-desc": result.sort((a, b) => b.pricePerUnit - a.pricePerUnit); break;
            case "name-asc": result.sort((a, b) => a.name.localeCompare(b.name)); break;
            case "stock-desc": result.sort((a, b) => b.availableStock - a.availableStock); break;
        }
        return result;
    }, [categories, search, filters]);

    /* ─── Buy Click (auth-aware) ─── */
    const handleBuyClick = (cat: Category) => {
        if (isLoading) return;
        if (!isAuthenticated) { setShowAuthGate(true); return; }
        setSelectedCat(cat); setQty(1); setPurchaseResult(null); setPurchaseErr("");
    };

    const handlePurchase = async () => {
        if (!selectedCat) return;
        setPurchasing(true); setPurchaseErr("");
        try {
            const res = await fetch("/api/mmo/purchase", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categoryId: selectedCat.id, quantity: qty }),
            });
            const data = await res.json();
            if (!res.ok) setPurchaseErr(data.error || "Purchase failed");
            else {
                setPurchaseResult(data);
                adjustCredits(-data.totalCost);   // optimistic UI update
                refreshCredits();                  // sync with server
                fetchCategories();
            }
        } catch { setPurchaseErr("Network error"); }
        finally { setPurchasing(false); }
    };

    const copyAllData = () => {
        if (!purchaseResult) return;
        const lines = [purchaseResult.fields.join("|"), ...purchaseResult.items.map(i => i.data)];
        navigator.clipboard.writeText(lines.join("\n"));
        setCopied(true); setTimeout(() => setCopied(false), 2000);
    };
    const downloadData = () => {
        if (!purchaseResult) return;
        const lines = [purchaseResult.fields.join("|"), ...purchaseResult.items.map(i => i.data)];
        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url;
        a.download = `${purchaseResult.category.replace(/\s+/g, "_")}_${Date.now()}.txt`;
        a.click(); URL.revokeObjectURL(url);
    };
    const closeModal = () => { setSelectedCat(null); setPurchaseResult(null); setPurchaseErr(""); setQty(1); };

    /* ─── CHAT: E2EE handlers ─── */
    const openChat = async () => {
        setChatOpen(true);
        if (!isAuthenticated) return;
        setChatLoading(true);
        try {
            const res = await fetch("/api/mmo/chat");
            const data = await res.json();
            if (data.exists && !data.closed) {
                setChatPhase("pin-unlock");
            } else if (data.exists && data.closed) {
                setChatClosed(true);
                setChatPhase("pin-setup"); // closed chat — user can create new one
            } else {
                setChatPhase("pin-setup");
            }
        } catch { /* noop */ }
        finally { setChatLoading(false); }
    };

    const handlePinSetup = async () => {
        setChatPinErr("");
        if (chatPin.length < 4) { setChatPinErr("PIN must be at least 4 digits"); return; }
        if (chatPin !== chatPinConfirm) { setChatPinErr("PINs do not match"); return; }
        setChatLoading(true);
        try {
            // 1. Generate ECDH keypair (extractable so we can encrypt the private key)
            const kp = await generateECDHKeypair();
            const pubJwk = await exportPubKey(kp.publicKey);
            const privJwk = await exportPrivKey(kp.privateKey);

            // 2. Encrypt the private key with PIN-derived wrapping key
            const wrappingKey = await pinToWrappingKey(chatPin);
            const { encPrivKey, keyIv } = await encryptPrivateKey(privJwk, wrappingKey);

            // 3. Initialize chat on server — get admin public key back
            const res = await fetch("/api/mmo/chat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin: chatPin, userPubKey: pubJwk, userEncPrivKey: encPrivKey, userKeyIv: keyIv }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setChatPinErr(d.error || "Failed to create chat");
                return;
            }
            const { adminPubKey } = await res.json();

            // 4. Derive shared AES key from ECDH(userPrivate, adminPublic)
            const shared = await deriveSharedKey(kp.privateKey, adminPubKey);
            setSharedKey(shared);
            setChatClosed(false);
            setChatPhase("chat");
            setChatMessages([]);
        } catch (err) {
            console.error(err);
            setChatPinErr("Encryption setup failed");
        } finally {
            setChatLoading(false);
        }
    };

    const handlePinUnlock = async () => {
        setChatPinErr("");
        if (chatPin.length < 4) { setChatPinErr("Enter your PIN"); return; }
        setChatLoading(true);
        try {
            // 1. Verify PIN server-side (rate-limited, 5 attempts/min)
            const pinRes = await fetch("/api/mmo/chat/verify-pin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin: chatPin }),
            });

            if (pinRes.status === 429) {
                const d = await pinRes.json().catch(() => ({}));
                setChatPinErr(d.error || "Too many attempts. Try again later.");
                setChatLoading(false);
                return;
            }

            if (pinRes.status === 403) {
                setChatPinErr("Incorrect PIN");
                setChatLoading(false);
                return;
            }

            if (!pinRes.ok) {
                const d = await pinRes.json().catch(() => ({}));
                setChatPinErr(d.error || "Verification failed");
                setChatLoading(false);
                return;
            }

            const pinData = await pinRes.json();
            if (!pinData.verified) {
                setChatPinErr("Incorrect PIN");
                setChatLoading(false);
                return;
            }

            // 2. Decrypt the stored private key using PIN-derived wrapping key
            //    (key material is returned from verify-pin only on success)
            const wrappingKey = await pinToWrappingKey(chatPin);
            const userPrivKey = await decryptPrivateKey(pinData.userEncPrivKey, pinData.userKeyIv, wrappingKey);

            // 3. Fetch chat messages + admin public key
            const chatRes = await fetch("/api/mmo/chat");
            const chatData = await chatRes.json();
            if (!chatData.exists) { setChatPhase("pin-setup"); return; }
            if (chatData.closed) { setChatClosed(true); setChatPhase("pin-setup"); return; }

            // 4. Derive shared AES key from ECDH(userPrivate, adminPublic)
            if (!chatData.adminPubKey) { setChatPinErr("Admin chat not configured yet"); setChatLoading(false); return; }
            const shared = await deriveSharedKey(userPrivKey, chatData.adminPubKey);
            setSharedKey(shared);

            // 5. Decrypt messages
            const decrypted = await Promise.all(
                chatData.messages.map(async (msg: ChatMessage) => {
                    try {
                        const plaintext = await decryptMessage(shared, msg.ciphertext, msg.iv);
                        return { ...msg, decrypted: plaintext ?? "[Unable to decrypt]" };
                    } catch {
                        return { ...msg, decrypted: "[Unable to decrypt]" };
                    }
                })
            );
            setChatMessages(decrypted);
            setChatPhase("chat");
        } catch (err) {
            console.error(err);
            setChatPinErr("Unlock failed");
        } finally {
            setChatLoading(false);
        }
    };

    const sendChatMessage = async () => {
        if (!chatInput.trim() || !sharedKey || chatSending) return;
        setChatSending(true);
        // Stop typing indicator
        fetch("/api/mmo/chat/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typing: false }) }).catch(() => {});
        try {
            const encrypted = await encryptMessage(sharedKey, chatInput.trim());
            const res = await fetch("/api/mmo/chat/message", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(encrypted),
            });
            if (res.ok) {
                const msg = await res.json();
                setChatMessages(prev => [...prev, { ...msg, decrypted: chatInput.trim() }]);
                setChatInput("");
                setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            }
        } catch { /* silent */ }
        finally { setChatSending(false); }
    };

    // Typing signal — debounced
    const signalTyping = (val: string) => {
        setChatInput(val);
        if (!sharedKey || chatPhase !== "chat") return;
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

    // Auto-refresh: poll for new messages + typing indicator every 3s
    useEffect(() => {
        if (chatPhase !== "chat" || !sharedKey || !chatOpen) return;
        const iv = setInterval(async () => {
            try {
                // Poll messages
                const res = await fetch("/api/mmo/chat");
                const data = await res.json();
                if (data.exists && data.messages) {
                    const serverMsgs: ChatMessage[] = data.messages;
                    const decryptedNew = await Promise.all(serverMsgs.map(async (msg: ChatMessage) => {
                        try { return { ...msg, decrypted: await decryptMessage(sharedKey, msg.ciphertext, msg.iv) ?? "[Unable to decrypt]" }; }
                        catch { return { ...msg, decrypted: "[Unable to decrypt]" }; }
                    }));
                    setChatMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id));
                        const newOnly = decryptedNew.filter(m => !existingIds.has(m.id));
                        if (newOnly.length === 0) return prev;
                        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
                        return [...prev, ...newOnly];
                    });
                }
                // Poll typing
                const tr = await fetch("/api/mmo/chat/typing");
                const td = await tr.json();
                setAdminTyping(td.typing === true);
            } catch { /* silent */ }
        }, 3000);
        return () => clearInterval(iv);
    }, [chatPhase, sharedKey, chatOpen]);

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };

    return (
        <div style={{ padding: "28px 32px", minHeight: "100vh", position: "relative" }}>

            {/* ═══ Header ═══ */}
            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.75rem", color: t.textMuted, marginBottom: 6 }}>MMO Market &bull; Storefront</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
                        <ShoppingBag style={{ width: 22, height: 22, color: t.accentPrimary }} /> Digital Assets
                    </h1>
                    {isAuthenticated ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: t.statusSuccess }} />
                            <span style={{ fontSize: "0.78rem", color: t.textSecondary }}>
                                Signed in as <strong style={{ color: t.textPrimary }}>{session?.user?.name || session?.user?.email}</strong>
                            </span>
                        </div>
                    ) : isLoading ? (
                        <span style={{ fontSize: "0.78rem", color: t.textMuted }}>Checking session...</span>
                    ) : (
                        <Link href="/auth/login" style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
                            borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`,
                            textDecoration: "none", color: t.textSecondary, fontSize: "0.78rem", fontWeight: 600,
                        }}><LogIn style={{ width: 13, height: 13 }} /> Sign in to buy</Link>
                    )}
                </div>
            </div>

            {/* ═══ Toolbar: Search + Grid ═══ */}
            <div style={{ ...card, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 8 }}>
                    <Search style={{ width: 14, height: 14, color: t.textMuted, flexShrink: 0 }} />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..."
                        style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: t.textPrimary, fontSize: "0.85rem", fontFamily: t.fontFamily }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Grid3X3 style={{ width: 13, height: 13, color: t.textMuted }} />
                    {GRID_OPTIONS.map(opt => (
                        <button key={opt.cols} onClick={() => setGridCols(opt.cols)} style={{
                            width: 28, height: 26, borderRadius: t.buttonRadius,
                            border: `1px solid ${gridCols === opt.cols ? t.accentPrimary + "66" : t.borderPrimary}`,
                            background: gridCols === opt.cols ? t.accentPrimaryMuted : "transparent",
                            color: gridCols === opt.cols ? t.accentPrimary : t.textMuted,
                            fontWeight: 700, fontSize: "0.72rem", cursor: "pointer", fontFamily: t.fontMono,
                        }}>{opt.label}</button>
                    ))}
                </div>
                <span style={{ fontSize: "0.72rem", color: t.textMuted }}>{displayed.length} product{displayed.length !== 1 ? "s" : ""}</span>
            </div>

            {/* ═══ Product Grid ═══ */}
            {loading ? (
                <div style={{ ...card, padding: "56px 40px", textAlign: "center" }}><p style={{ color: t.textMuted }}>Loading products...</p></div>
            ) : displayed.length === 0 ? (
                <div style={{ ...card, padding: "56px 40px", textAlign: "center" }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                        <Package style={{ width: 28, height: 28, color: t.accentPrimary }} />
                    </div>
                    <h3 style={{ fontWeight: 700, marginBottom: 8, fontSize: "1.2rem", color: t.textPrimary }}>No Products Found</h3>
                    <p style={{ color: t.textMuted, maxWidth: 400, margin: "0 auto", fontSize: "0.875rem" }}>
                        {search ? "No products match your search or filters." : "The marketplace is currently empty."}
                    </p>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: gridCols >= 5 ? 12 : 16 }}>
                    {displayed.map(cat => (
                        <div key={cat.id} style={{ ...card, overflow: "hidden", display: "flex", flexDirection: "column", transition: "all 0.2s ease" }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = t.accentPrimary; e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = t.borderPrimary; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = t.shadow; }}>
                            {/* Image */}
                            <div style={{ width: "100%", aspectRatio: "16/10", background: cat.imageUrl ? "transparent" : t.bgTertiary, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", borderBottom: `1px solid ${t.borderSecondary}` }}>
                                {cat.imageUrl ? (
                                    <Image src={cat.imageUrl} alt={cat.name} fill sizes={`${Math.floor(100/gridCols)}vw`} style={{ objectFit: "cover" }} unoptimized />
                                ) : (
                                    <Layers style={{ width: gridCols >= 5 ? 26 : 34, height: gridCols >= 5 ? 26 : 34, color: t.textMuted, opacity: 0.4 }} />
                                )}
                                <span style={{ position: "absolute", top: 8, right: 8, padding: "3px 9px", borderRadius: 12, fontSize: "0.65rem", fontWeight: 700, background: "rgba(0,0,0,0.7)", color: cat.availableStock > 0 ? t.statusSuccess : t.statusError, border: `1px solid ${cat.availableStock > 0 ? t.statusSuccess : t.statusError}44`, backdropFilter: "blur(4px)" }}>
                                    {cat.availableStock > 0 ? `${cat.availableStock.toLocaleString()} in stock` : "Sold out"}
                                </span>
                            </div>
                            {/* Name + Desc + Buy */}
                            <div style={{ padding: gridCols >= 5 ? "12px 14px 10px" : "16px 18px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
                                <h3 style={{ fontWeight: 700, fontSize: gridCols >= 5 ? "0.82rem" : "0.95rem", color: t.textPrimary, marginBottom: 4, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{cat.name}</h3>
                                <p style={{ fontSize: gridCols >= 5 ? "0.7rem" : "0.78rem", color: t.textMuted, lineHeight: 1.4, flex: 1, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: gridCols >= 5 ? 2 : 3, WebkitBoxOrient: "vertical", marginBottom: gridCols >= 5 ? 8 : 12 }}>
                                    {cat.description || "Digital asset"}
                                </p>
                                <button onClick={() => handleBuyClick(cat)} disabled={cat.availableStock === 0 || isLoading} style={{
                                    width: "100%", padding: gridCols >= 5 ? "8px 12px" : "10px 16px", borderRadius: t.buttonRadius,
                                    background: cat.availableStock === 0 ? t.bgTertiary : (t.isMono ? t.accentPrimary : "linear-gradient(135deg,#3b82f6,#2563eb)"),
                                    color: cat.availableStock === 0 ? t.textMuted : (t.isMono ? t.bgPrimary : "#fff"),
                                    border: "none", fontWeight: 700, fontSize: gridCols >= 5 ? "0.72rem" : "0.82rem",
                                    cursor: cat.availableStock === 0 ? "not-allowed" : "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                    opacity: cat.availableStock === 0 ? 0.5 : 1, fontFamily: t.fontFamily,
                                }}>
                                    <ShoppingCart style={{ width: gridCols >= 5 ? 12 : 14, height: gridCols >= 5 ? 12 : 14 }} />
                                    {cat.availableStock === 0 ? "Sold Out" : `Buy — ${cat.pricePerUnit.toLocaleString()} Credits`}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Retention */}
            <div style={{ ...card, padding: "12px 18px", marginTop: 20, display: "flex", alignItems: "center", gap: 10 }}>
                <Clock style={{ width: 14, height: 14, color: t.statusWarning, flexShrink: 0 }} />
                <p style={{ fontSize: "0.75rem", color: t.textSecondary, lineHeight: 1.5 }}>
                    <strong style={{ color: t.statusWarning }}>30-day retention:</strong> Purchased data expires 30 days after purchase and is permanently deleted.
                </p>
            </div>

            {/* ═══ Auth Gate Modal ═══ */}
            {showAuthGate && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setShowAuthGate(false); }}>
                    <div style={{ ...card, width: "100%", maxWidth: 420, padding: 0, overflow: "hidden" }}>
                        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <LogIn style={{ width: 18, height: 18, color: t.accentPrimary }} />
                                <h2 style={{ fontWeight: 800, fontSize: "1.05rem", color: t.textPrimary }}>Sign In Required</h2>
                            </div>
                            <button onClick={() => setShowAuthGate(false)} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X style={{ width: 14, height: 14 }} /></button>
                        </div>
                        <div style={{ padding: 24 }}>
                            <p style={{ color: t.textSecondary, fontSize: "0.9rem", lineHeight: 1.6, marginBottom: 24 }}>You must be signed in to purchase digital assets.</p>
                            <div style={{ display: "flex", gap: 10 }}>
                                <Link href="/auth/register" style={{ flex: 1, padding: "12px 0", borderRadius: t.buttonRadius, textDecoration: "none", background: t.accentPrimary, color: t.isMono ? t.bgPrimary : "#fff", fontWeight: 700, fontSize: "0.88rem", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>Create Account</Link>
                                <Link href="/auth/login" style={{ flex: 1, padding: "12px 0", borderRadius: t.buttonRadius, textDecoration: "none", background: "transparent", color: t.textSecondary, border: `1px solid ${t.borderPrimary}`, fontWeight: 600, fontSize: "0.88rem", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                    <LogIn style={{ width: 14, height: 14 }} /> Log In
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Purchase Modal ═══ */}
            {selectedCat && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div style={{ ...card, width: "100%", maxWidth: purchaseResult ? 720 : 480, maxHeight: "85vh", overflowY: "auto", padding: 0, transition: "max-width 0.2s" }}>
                        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <ShoppingCart style={{ width: 18, height: 18, color: t.accentPrimary }} />
                                <h2 style={{ fontWeight: 800, fontSize: "1.05rem", color: t.textPrimary }}>{purchaseResult ? "Purchase Complete" : `Buy: ${selectedCat.name}`}</h2>
                            </div>
                            <button onClick={closeModal} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X style={{ width: 14, height: 14 }} /></button>
                        </div>
                        <div style={{ padding: 24 }}>
                            {purchaseResult ? (
                                <>
                                    <div style={{ padding: "14px 18px", borderRadius: t.buttonRadius, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                                        <Check style={{ width: 16, height: 16, color: t.statusSuccess }} />
                                        <div>
                                            <p style={{ fontSize: "0.85rem", fontWeight: 700, color: t.statusSuccess }}>{purchaseResult.quantity} item(s) &mdash; {purchaseResult.totalCost.toLocaleString()} Credits</p>
                                            <p style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 2 }}>Expires: {new Date(purchaseResult.expiresAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                                        <button onClick={copyAllData} style={{ flex: 1, padding: "10px 16px", borderRadius: t.buttonRadius, background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}44`, color: t.accentPrimary, fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                            {copied ? <><Check style={{ width: 14, height: 14 }} /> Copied</> : <><Copy style={{ width: 14, height: 14 }} /> Copy All</>}
                                        </button>
                                        <button onClick={downloadData} style={{ flex: 1, padding: "10px 16px", borderRadius: t.buttonRadius, background: t.bgSecondary, border: `1px solid ${t.borderPrimary}`, color: t.textSecondary, fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                            <Download style={{ width: 14, height: 14 }} /> Download .txt
                                        </button>
                                    </div>
                                    <div style={{ borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, overflow: "hidden" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: `repeat(${purchaseResult.fields.length}, 1fr)`, background: t.bgTertiary, padding: "8px 12px", gap: 8 }}>
                                            {purchaseResult.fields.map(f => <span key={f} style={{ fontSize: "0.7rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: t.fontMono }}>{f}</span>)}
                                        </div>
                                        {purchaseResult.items.map((item, idx) => (
                                            <div key={item.id} style={{ display: "grid", gridTemplateColumns: `repeat(${purchaseResult.fields.length}, 1fr)`, padding: "8px 12px", gap: 8, background: idx % 2 === 0 ? "transparent" : t.bgSecondary, borderTop: `1px solid ${t.borderSecondary}` }}>
                                                {item.data.split("|").map((val, vi) => <span key={vi} style={{ fontSize: "0.78rem", color: t.textPrimary, fontFamily: t.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{val}</span>)}
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: t.buttonRadius, background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`, display: "flex", alignItems: "center", gap: 8 }}>
                                        <AlertTriangle style={{ width: 14, height: 14, color: t.statusWarning, flexShrink: 0 }} />
                                        <p style={{ fontSize: "0.75rem", color: t.statusWarning }}>Save this data now. It will be deleted after 30 days.</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ padding: "16px 18px", borderRadius: t.buttonRadius, background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`, marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
                                        {selectedCat.imageUrl ? (
                                            <div style={{ width: 56, height: 56, borderRadius: t.buttonRadius, overflow: "hidden", flexShrink: 0, position: "relative" }}>
                                                <Image src={selectedCat.imageUrl} alt={selectedCat.name} fill style={{ objectFit: "cover" }} unoptimized />
                                            </div>
                                        ) : (
                                            <div style={{ width: 56, height: 56, borderRadius: t.buttonRadius, background: t.bgTertiary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                <Layers style={{ width: 24, height: 24, color: t.textMuted }} />
                                            </div>
                                        )}
                                        <div>
                                            <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>{selectedCat.name}</p>
                                            {selectedCat.description && <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 2 }}>{selectedCat.description}</p>}
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: 20 }}>
                                        <p style={{ fontSize: "0.75rem", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Quantity</p>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 36, height: 36, borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: t.bgSecondary, color: t.textSecondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Minus style={{ width: 14, height: 14 }} /></button>
                                            <input type="number" min={1} max={Math.min(1000, selectedCat.availableStock)} value={qty}
                                                onChange={e => setQty(Math.max(1, Math.min(1000, Math.min(selectedCat.availableStock, Number(e.target.value) || 1))))}
                                                style={{ width: 80, textAlign: "center", padding: "8px 12px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: t.bgInput, color: t.textPrimary, fontSize: "1rem", fontWeight: 800, fontFamily: t.fontMono, outline: "none" }} />
                                            <button onClick={() => setQty(q => Math.min(1000, Math.min(selectedCat.availableStock, q + 1)))} style={{ width: 36, height: 36, borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: t.bgSecondary, color: t.textSecondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus style={{ width: 14, height: 14 }} /></button>
                                            <span style={{ fontSize: "0.75rem", color: t.textMuted }}>/ {selectedCat.availableStock.toLocaleString()} (max 1,000)</span>
                                        </div>
                                    </div>
                                    <div style={{ padding: "14px 18px", borderRadius: t.buttonRadius, background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`, marginBottom: 20 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                            <span style={{ fontSize: "0.82rem", color: t.textMuted }}>Unit price</span>
                                            <span style={{ fontSize: "0.82rem", color: t.textSecondary, fontWeight: 600 }}>{selectedCat.pricePerUnit.toLocaleString()} Cr</span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                            <span style={{ fontSize: "0.82rem", color: t.textMuted }}>Qty</span>
                                            <span style={{ fontSize: "0.82rem", color: t.textSecondary, fontWeight: 600 }}>{qty}</span>
                                        </div>
                                        <div style={{ borderTop: `1px solid ${t.borderPrimary}`, paddingTop: 10, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                                            <span style={{ fontSize: "0.9rem", fontWeight: 800, color: t.textPrimary }}>Total</span>
                                            <span style={{ fontSize: "1.1rem", fontWeight: 900, color: t.accentPrimary }}>{(selectedCat.pricePerUnit * qty).toLocaleString()} Credits</span>
                                        </div>
                                    </div>
                                    {purchaseErr && (
                                        <div style={{ padding: "10px 14px", borderRadius: t.buttonRadius, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, fontSize: "0.82rem", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                                            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} /> {purchaseErr}
                                        </div>
                                    )}
                                    <button onClick={handlePurchase} disabled={purchasing} style={{
                                        width: "100%", padding: "13px 0", borderRadius: t.cardRadius,
                                        background: t.isMono ? t.accentPrimary : "linear-gradient(135deg,#3b82f6,#2563eb)",
                                        color: t.isMono ? t.bgPrimary : "#fff", fontWeight: 800, fontSize: "0.95rem", border: "none",
                                        cursor: purchasing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                        opacity: purchasing ? 0.6 : 1,
                                    }}>
                                        <ShoppingCart style={{ width: 16, height: 16 }} />
                                        {purchasing ? "Processing..." : `Purchase — ${(selectedCat.pricePerUnit * qty).toLocaleString()} Credits`}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════ SUPPORT CHAT FAB + PANEL ═══════════════════ */}
            {isAuthenticated && (
                <>
                    {/* FAB */}
                    {!chatOpen && (
                        <button
                            onClick={openChat}
                            style={{
                                position: "fixed", bottom: 24, left: 324, // offset by sidebar width (300) + gap
                                width: 52, height: 52, borderRadius: "50%", border: "none",
                                background: t.isMono ? t.accentPrimary : "linear-gradient(135deg,#3b82f6,#6366f1)",
                                color: "#fff", cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                zIndex: 8000, transition: "transform 0.15s",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
                            title="Admin Support Chat"
                        >
                            <MessageCircle style={{ width: 22, height: 22 }} />
                        </button>
                    )}

                    {/* Chat Panel */}
                    {chatOpen && (
                        <div style={{
                            position: "fixed", bottom: 24, left: 324,
                            width: 380, height: 520, zIndex: 8000,
                            ...card, display: "flex", flexDirection: "column",
                            overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
                        }}>
                            {/* Chat Header */}
                            <div style={{
                                padding: "14px 18px", borderBottom: `1px solid ${t.borderSecondary}`,
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                background: t.bgSecondary,
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <Shield style={{ width: 16, height: 16, color: t.statusSuccess }} />
                                    <div>
                                        <p style={{ fontWeight: 700, fontSize: "0.88rem", color: t.textPrimary }}>Admin Support</p>
                                        <p style={{ fontSize: "0.65rem", color: t.statusSuccess, display: "flex", alignItems: "center", gap: 4 }}>
                                            <Lock style={{ width: 9, height: 9 }} /> End-to-end encrypted
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setChatOpen(false)} style={{
                                    width: 26, height: 26, borderRadius: "50%", border: `1px solid ${t.borderPrimary}`,
                                    background: "transparent", color: t.textMuted, cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}><X style={{ width: 12, height: 12 }} /></button>
                            </div>

                            {/* Chat Content */}
                            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                                {chatLoading ? (
                                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Loader2 style={{ width: 24, height: 24, color: t.accentPrimary, animation: "spin 1s linear infinite" }} />
                                    </div>
                                ) : chatPhase === "pin-setup" ? (
                                    /* ── PIN Setup ── */
                                    <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
                                        <div style={{ textAlign: "center", marginBottom: 8 }}>
                                            <KeyRound style={{ width: 36, height: 36, color: t.accentPrimary, margin: "0 auto 12px" }} />
                                            <h3 style={{ fontWeight: 800, fontSize: "1rem", color: t.textPrimary }}>Set Your Chat PIN</h3>
                                            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>
                                                This PIN protects your encrypted chat. It cannot be recovered.
                                            </p>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: "0.7rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" }}>Create PIN</label>
                                            <input type="password" inputMode="numeric" maxLength={8} value={chatPin}
                                                onChange={e => setChatPin(e.target.value.replace(/\D/g, ""))} placeholder="Enter 4+ digit PIN"
                                                style={{ width: "100%", padding: "10px 14px", boxSizing: "border-box", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "1.1rem", fontFamily: t.fontMono, textAlign: "center", letterSpacing: "0.3em", outline: "none" }} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: "0.7rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" }}>Confirm PIN</label>
                                            <input type="password" inputMode="numeric" maxLength={8} value={chatPinConfirm}
                                                onChange={e => setChatPinConfirm(e.target.value.replace(/\D/g, ""))} placeholder="Re-enter PIN"
                                                onKeyDown={e => { if (e.key === "Enter") handlePinSetup(); }}
                                                style={{ width: "100%", padding: "10px 14px", boxSizing: "border-box", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "1.1rem", fontFamily: t.fontMono, textAlign: "center", letterSpacing: "0.3em", outline: "none" }} />
                                        </div>
                                        {chatPinErr && <p style={{ fontSize: "0.78rem", color: t.statusError, textAlign: "center" }}>{chatPinErr}</p>}
                                        <button onClick={handlePinSetup} style={{
                                            padding: "11px 0", borderRadius: t.buttonRadius, background: t.accentPrimary,
                                            color: t.isMono ? t.bgPrimary : "#fff", fontWeight: 700, fontSize: "0.88rem",
                                            border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                        }}>
                                            <Lock style={{ width: 14, height: 14 }} /> Initialize Encrypted Chat
                                        </button>
                                    </div>
                                ) : chatPhase === "pin-unlock" ? (
                                    /* ── PIN Unlock ── */
                                    <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
                                        <div style={{ textAlign: "center", marginBottom: 8 }}>
                                            <Lock style={{ width: 36, height: 36, color: t.accentPrimary, margin: "0 auto 12px" }} />
                                            <h3 style={{ fontWeight: 800, fontSize: "1rem", color: t.textPrimary }}>Unlock Chat</h3>
                                            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 4 }}>Enter your PIN to access encrypted messages.</p>
                                        </div>
                                        <input type="password" inputMode="numeric" maxLength={8} value={chatPin}
                                            onChange={e => setChatPin(e.target.value.replace(/\D/g, ""))}
                                            onKeyDown={e => { if (e.key === "Enter") handlePinUnlock(); }}
                                            placeholder="Enter PIN"
                                            style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "1.3rem", fontFamily: t.fontMono, textAlign: "center", letterSpacing: "0.3em", outline: "none" }} />
                                        {chatPinErr && <p style={{ fontSize: "0.78rem", color: t.statusError, textAlign: "center" }}>{chatPinErr}</p>}
                                        <button onClick={handlePinUnlock} style={{
                                            padding: "11px 0", borderRadius: t.buttonRadius, background: t.accentPrimary,
                                            color: t.isMono ? t.bgPrimary : "#fff", fontWeight: 700, fontSize: "0.88rem",
                                            border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                        }}>
                                            <KeyRound style={{ width: 14, height: 14 }} /> Unlock
                                        </button>

                                        {/* Forgot PIN — two-step destructive reset */}
                                        {chatResetStep === "idle" && (
                                            <button onClick={() => setChatResetStep("warn")} style={{
                                                background: "none", border: "none", color: t.textMuted,
                                                fontSize: "0.72rem", cursor: "pointer", textAlign: "center",
                                                textDecoration: "underline", textDecorationStyle: "dotted",
                                                marginTop: -8,
                                            }}>
                                                Forgot PIN? Reset (all chat history will be lost)
                                            </button>
                                        )}

                                        {chatResetStep === "warn" && (
                                            <div style={{ background: t.statusErrorBg, border: `1px solid ${t.statusError}44`, borderRadius: t.isMono ? 0 : 8, padding: "14px" }}>
                                                <p style={{ fontSize: "0.8rem", color: t.statusError, fontWeight: 700, marginBottom: 8 }}>
                                                    This will permanently delete all your chat messages and close this thread.
                                                </p>
                                                <p style={{ fontSize: "0.75rem", color: t.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
                                                    You will be able to start a fresh encrypted chat with a new PIN.
                                                </p>
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <button onClick={() => setChatResetStep("idle")} style={{ flex: 1, padding: "8px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 700, fontSize: "0.8rem", cursor: "pointer" }}>
                                                        Cancel
                                                    </button>
                                                    <button onClick={() => setChatResetStep("confirm")} style={{ flex: 1, padding: "8px", borderRadius: t.buttonRadius, border: "none", background: t.statusError, color: "#fff", fontWeight: 800, fontSize: "0.8rem", cursor: "pointer" }}>
                                                        Yes, Delete & Reset
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {chatResetStep === "confirm" && (
                                            <div style={{ background: t.statusErrorBg, border: `1px solid ${t.statusError}44`, borderRadius: t.isMono ? 0 : 8, padding: "14px" }}>
                                                <p style={{ fontSize: "0.8rem", color: t.statusError, fontWeight: 700, marginBottom: 10 }}>
                                                    Final confirmation — cannot be undone.
                                                </p>
                                                {chatPinErr && <p style={{ fontSize: "0.75rem", color: t.statusError, marginBottom: 8 }}>{chatPinErr}</p>}
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <button onClick={() => { setChatResetStep("idle"); setChatPinErr(""); }} style={{ flex: 1, padding: "8px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 700, fontSize: "0.8rem", cursor: "pointer" }}>
                                                        Cancel
                                                    </button>
                                                    <button onClick={handleChatReset} disabled={chatResetting} style={{ flex: 1, padding: "8px", borderRadius: t.buttonRadius, border: "none", background: t.statusError, color: "#fff", fontWeight: 800, fontSize: "0.8rem", cursor: chatResetting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                                        {chatResetting ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : null}
                                                        {chatResetting ? "Resetting…" : "Confirm Reset"}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* ── Chat Messages ── */
                                    <>
                                        <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                                            {chatMessages.length === 0 && (
                                                <div style={{ textAlign: "center", padding: "40px 0" }}>
                                                    <MessageCircle style={{ width: 32, height: 32, color: t.textMuted, opacity: 0.3, margin: "0 auto 12px" }} />
                                                    <p style={{ fontSize: "0.82rem", color: t.textMuted }}>No messages yet. Start the conversation.</p>
                                                </div>
                                            )}
                                            {chatMessages.map(msg => (
                                                <div key={msg.id} style={{
                                                    alignSelf: msg.senderType === "USER" ? "flex-end" : "flex-start",
                                                    maxWidth: "80%",
                                                }}>
                                                    <div style={{
                                                        padding: "10px 14px", borderRadius: 14,
                                                        background: msg.senderType === "USER"
                                                            ? (t.isMono ? t.accentPrimary : "linear-gradient(135deg,#3b82f6,#2563eb)")
                                                            : t.bgSecondary,
                                                        color: msg.senderType === "USER" ? (t.isMono ? t.bgPrimary : "#fff") : t.textPrimary,
                                                        border: msg.senderType === "USER" ? "none" : `1px solid ${t.borderSecondary}`,
                                                    }}>
                                                        <p style={{ fontSize: "0.82rem", lineHeight: 1.5, wordBreak: "break-word" }}>
                                                            {msg.decrypted || "[Encrypted]"}
                                                        </p>
                                                    </div>
                                                    <p style={{
                                                        fontSize: "0.6rem", color: t.textMuted, marginTop: 3,
                                                        textAlign: msg.senderType === "USER" ? "right" : "left",
                                                    }}>
                                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                    </p>
                                                </div>
                                            ))}
                                            <div ref={chatEndRef} />
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
                                        <div style={{
                                            padding: "12px 14px", borderTop: `1px solid ${t.borderSecondary}`,
                                            display: "flex", alignItems: "center", gap: 8,
                                        }}>
                                            <input
                                                value={chatInput} onChange={e => signalTyping(e.target.value)}
                                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                                                placeholder="Type a message..."
                                                style={{
                                                    flex: 1, padding: "10px 14px", borderRadius: 20,
                                                    background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
                                                    color: t.textPrimary, fontSize: "0.85rem", fontFamily: t.fontFamily,
                                                    outline: "none",
                                                }}
                                            />
                                            <button
                                                onClick={sendChatMessage}
                                                disabled={!chatInput.trim() || chatSending}
                                                style={{
                                                    width: 38, height: 38, borderRadius: "50%", border: "none",
                                                    background: chatInput.trim() ? t.accentPrimary : t.bgTertiary,
                                                    color: chatInput.trim() ? (t.isMono ? t.bgPrimary : "#fff") : t.textMuted,
                                                    cursor: chatInput.trim() ? "pointer" : "not-allowed",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    transition: "all 0.15s",
                                                }}
                                            >
                                                {chatSending
                                                    ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                                                    : <Send style={{ width: 16, height: 16 }} />}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Spin animation for loader */}
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
        </div>
    );
}
