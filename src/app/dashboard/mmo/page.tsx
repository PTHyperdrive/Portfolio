"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    ShoppingBag, Package, Search, Minus, Plus, ShoppingCart,
    Copy, Check, Clock, AlertTriangle, Download, Layers, Tag
} from "lucide-react";

type Category = {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    fields: string[];
    pricePerUnit: number;
    availableStock: number;
};

type PurchasedItem = { id: string; data: string; expiresAt: string };
type PurchaseResult = {
    success: boolean;
    category: string;
    fields: string[];
    quantity: number;
    totalCost: number;
    expiresAt: string;
    items: PurchasedItem[];
};

export default function MmoMarketPage() {
    const t = useThemeTokens();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    // Purchase modal
    const [selectedCat, setSelectedCat] = useState<Category | null>(null);
    const [qty, setQty] = useState(1);
    const [purchasing, setPurchasing] = useState(false);
    const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
    const [purchaseErr, setPurchaseErr] = useState("");
    const [copied, setCopied] = useState(false);

    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };

    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch("/api/mmo");
            if (res.ok) setCategories(await res.json());
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchCategories(); }, [fetchCategories]);

    const filtered = categories.filter(
        (c) => c.name.toLowerCase().includes(search.toLowerCase())
            || (c.description || "").toLowerCase().includes(search.toLowerCase())
    );

    const handlePurchase = async () => {
        if (!selectedCat) return;
        setPurchasing(true);
        setPurchaseErr("");
        try {
            const res = await fetch("/api/mmo/purchase", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categoryId: selectedCat.id, quantity: qty }),
            });
            const data = await res.json();
            if (!res.ok) {
                setPurchaseErr(data.error || "Purchase failed");
            } else {
                setPurchaseResult(data);
                fetchCategories(); // refresh stock
            }
        } catch {
            setPurchaseErr("Network error");
        } finally {
            setPurchasing(false);
        }
    };

    const copyAllData = () => {
        if (!purchaseResult) return;
        const header = purchaseResult.fields.join("|");
        const lines = purchaseResult.items.map((i) => i.data);
        navigator.clipboard.writeText([header, ...lines].join("\n"));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadData = () => {
        if (!purchaseResult) return;
        const header = purchaseResult.fields.join("|");
        const lines = purchaseResult.items.map((i) => i.data);
        const blob = new Blob([[header, ...lines].join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${purchaseResult.category.replace(/\s+/g, "_")}_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const closeModal = () => {
        setSelectedCat(null);
        setPurchaseResult(null);
        setPurchaseErr("");
        setQty(1);
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>
                    Dashboard &bull; MMO Market
                </p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
                    <ShoppingBag style={{ width: 24, height: 24, color: t.accentPrimary }} />
                    MMO <span style={{ color: t.accentPrimary }}>Market</span>
                </h1>
                <p style={{ color: t.textMuted, fontSize: "0.875rem", marginTop: 6 }}>
                    Browse and purchase digital assets. All data is delivered in plaintext and retained for 30 days.
                </p>
            </div>

            {/* Search */}
            <div style={{ ...card, padding: "12px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
                <Search style={{ width: 16, height: 16, color: t.textMuted, flexShrink: 0 }} />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search categories..."
                    style={{
                        flex: 1, background: "transparent", border: "none", outline: "none",
                        color: t.textPrimary, fontSize: "0.9rem", fontFamily: t.fontFamily,
                    }}
                />
            </div>

            {/* Categories Grid */}
            {loading ? (
                <div style={{ ...card, padding: "56px 40px", textAlign: "center" }}>
                    <p style={{ color: t.textMuted }}>Loading products...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ ...card, padding: "56px 40px", textAlign: "center" }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                        <Package style={{ width: 28, height: 28, color: t.accentPrimary }} />
                    </div>
                    <h3 style={{ fontWeight: 700, marginBottom: 8, fontSize: "1.2rem", color: t.textPrimary }}>No Products Available</h3>
                    <p style={{ color: t.textMuted, maxWidth: 400, margin: "0 auto", fontSize: "0.875rem" }}>
                        {search ? "No categories match your search." : "The marketplace is currently empty. Check back later."}
                    </p>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
                    {filtered.map((cat) => (
                        <div
                            key={cat.id}
                            style={{
                                ...card, padding: "24px", cursor: "pointer",
                                transition: "all 0.15s", position: "relative", overflow: "hidden",
                            }}
                            onClick={() => { setSelectedCat(cat); setQty(1); setPurchaseResult(null); setPurchaseErr(""); }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.accentPrimary; e.currentTarget.style.transform = "translateY(-2px)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = t.borderPrimary; e.currentTarget.style.transform = "none"; }}
                        >
                            {/* Category icon + name */}
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: t.isMono ? 8 : 12,
                                    background: t.accentPrimaryMuted,
                                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                }}>
                                    <Layers style={{ width: 20, height: 20, color: t.accentPrimary }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h3 style={{ fontWeight: 700, fontSize: "1rem", color: t.textPrimary, marginBottom: 2 }}>{cat.name}</h3>
                                    <p style={{ fontSize: "0.75rem", color: t.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {cat.description || "Digital asset"}
                                    </p>
                                </div>
                            </div>

                            {/* Schema fields as pills */}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                                {cat.fields.map((f) => (
                                    <span key={f} style={{
                                        padding: "3px 10px", borderRadius: 20, fontSize: "0.68rem", fontWeight: 600,
                                        background: t.bgTertiary, color: t.textSecondary, fontFamily: t.fontMono,
                                    }}>{f}</span>
                                ))}
                            </div>

                            {/* Bottom row: price + stock */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <Tag style={{ width: 13, height: 13, color: t.statusWarning }} />
                                    <span style={{ fontWeight: 800, fontSize: "1.1rem", color: t.textPrimary }}>
                                        {cat.pricePerUnit.toLocaleString()}
                                    </span>
                                    <span style={{ fontSize: "0.72rem", color: t.textMuted }}>Cr/unit</span>
                                </div>
                                <span style={{
                                    padding: "4px 12px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700,
                                    background: cat.availableStock > 0 ? t.statusSuccessBg : t.statusErrorBg,
                                    color: cat.availableStock > 0 ? t.statusSuccess : t.statusError,
                                }}>
                                    {cat.availableStock > 0 ? `${cat.availableStock.toLocaleString()} in stock` : "Out of stock"}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Retention notice */}
            <div style={{ ...card, padding: "16px 20px", marginTop: 24, display: "flex", alignItems: "center", gap: 10 }}>
                <Clock style={{ width: 16, height: 16, color: t.statusWarning, flexShrink: 0 }} />
                <p style={{ fontSize: "0.8rem", color: t.textSecondary, lineHeight: 1.5 }}>
                    <strong style={{ color: t.statusWarning }}>30-day retention policy:</strong> Purchased data is available for 30 days from the date of purchase. After expiration, data is permanently deleted and cannot be recovered.
                </p>
            </div>

            {/* ═══ Purchase Modal ═══ */}
            {selectedCat && (
                <div
                    style={{
                        position: "fixed", inset: 0, zIndex: 9999,
                        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: 24,
                    }}
                    onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div style={{
                        ...card, width: "100%", maxWidth: purchaseResult ? 720 : 480,
                        maxHeight: "85vh", overflowY: "auto", padding: 0,
                        transition: "max-width 0.2s",
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: "20px 24px", borderBottom: `1px solid ${t.borderSecondary}`,
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <ShoppingCart style={{ width: 18, height: 18, color: t.accentPrimary }} />
                                <h2 style={{ fontWeight: 800, fontSize: "1.1rem", color: t.textPrimary }}>
                                    {purchaseResult ? "Purchase Complete" : `Purchase: ${selectedCat.name}`}
                                </h2>
                            </div>
                            <button
                                onClick={closeModal}
                                style={{
                                    width: 28, height: 28, borderRadius: "50%", border: `1px solid ${t.borderPrimary}`,
                                    background: "transparent", color: t.textMuted, cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem",
                                }}
                            >&times;</button>
                        </div>

                        <div style={{ padding: 24 }}>
                            {purchaseResult ? (
                                /* ─── Results View ─── */
                                <>
                                    {/* Summary */}
                                    <div style={{
                                        padding: "14px 18px", borderRadius: t.buttonRadius,
                                        background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`,
                                        marginBottom: 20, display: "flex", alignItems: "center", gap: 10,
                                    }}>
                                        <Check style={{ width: 16, height: 16, color: t.statusSuccess }} />
                                        <div>
                                            <p style={{ fontSize: "0.85rem", fontWeight: 700, color: t.statusSuccess }}>
                                                {purchaseResult.quantity} item(s) purchased for {purchaseResult.totalCost.toLocaleString()} Credits
                                            </p>
                                            <p style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 2 }}>
                                                Data expires: {new Date(purchaseResult.expiresAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                                        <button onClick={copyAllData} style={{
                                            flex: 1, padding: "10px 16px", borderRadius: t.buttonRadius,
                                            background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}44`,
                                            color: t.accentPrimary, fontWeight: 700, fontSize: "0.82rem",
                                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                        }}>
                                            {copied ? <><Check style={{ width: 14, height: 14 }} /> Copied</> : <><Copy style={{ width: 14, height: 14 }} /> Copy All</>}
                                        </button>
                                        <button onClick={downloadData} style={{
                                            flex: 1, padding: "10px 16px", borderRadius: t.buttonRadius,
                                            background: t.bgSecondary, border: `1px solid ${t.borderPrimary}`,
                                            color: t.textSecondary, fontWeight: 700, fontSize: "0.82rem",
                                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                        }}>
                                            <Download style={{ width: 14, height: 14 }} /> Download .txt
                                        </button>
                                    </div>

                                    {/* Data table */}
                                    <div style={{
                                        borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`,
                                        overflow: "hidden",
                                    }}>
                                        {/* Header */}
                                        <div style={{
                                            display: "grid",
                                            gridTemplateColumns: `repeat(${purchaseResult.fields.length}, 1fr)`,
                                            background: t.bgTertiary, padding: "8px 12px", gap: 8,
                                        }}>
                                            {purchaseResult.fields.map((f) => (
                                                <span key={f} style={{
                                                    fontSize: "0.7rem", fontWeight: 700, color: t.textMuted,
                                                    textTransform: "uppercase", letterSpacing: "0.06em",
                                                    fontFamily: t.fontMono, overflow: "hidden", textOverflow: "ellipsis",
                                                }}>{f}</span>
                                            ))}
                                        </div>
                                        {/* Rows */}
                                        {purchaseResult.items.map((item, idx) => (
                                            <div
                                                key={item.id}
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: `repeat(${purchaseResult.fields.length}, 1fr)`,
                                                    padding: "8px 12px", gap: 8,
                                                    background: idx % 2 === 0 ? "transparent" : t.bgSecondary,
                                                    borderTop: `1px solid ${t.borderSecondary}`,
                                                }}
                                            >
                                                {item.data.split("|").map((val, vi) => (
                                                    <span key={vi} style={{
                                                        fontSize: "0.78rem", color: t.textPrimary,
                                                        fontFamily: t.fontMono, overflow: "hidden",
                                                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                    }}>{val}</span>
                                                ))}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Retention warning */}
                                    <div style={{
                                        marginTop: 16, padding: "10px 14px", borderRadius: t.buttonRadius,
                                        background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`,
                                        display: "flex", alignItems: "center", gap: 8,
                                    }}>
                                        <AlertTriangle style={{ width: 14, height: 14, color: t.statusWarning, flexShrink: 0 }} />
                                        <p style={{ fontSize: "0.75rem", color: t.statusWarning }}>
                                            Save this data now. It will be automatically deleted after 30 days.
                                        </p>
                                    </div>
                                </>
                            ) : (
                                /* ─── Order Form ─── */
                                <>
                                    {/* Product info */}
                                    <div style={{
                                        padding: "16px 18px", borderRadius: t.buttonRadius,
                                        background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`,
                                        marginBottom: 20,
                                    }}>
                                        <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem", marginBottom: 6 }}>{selectedCat.name}</p>
                                        {selectedCat.description && <p style={{ fontSize: "0.8rem", color: t.textMuted, marginBottom: 10 }}>{selectedCat.description}</p>}
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                            {selectedCat.fields.map((f) => (
                                                <span key={f} style={{
                                                    padding: "2px 8px", borderRadius: 20, fontSize: "0.68rem",
                                                    background: t.bgTertiary, color: t.textSecondary, fontFamily: t.fontMono,
                                                }}>{f}</span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Quantity selector */}
                                    <div style={{ marginBottom: 20 }}>
                                        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                                            Quantity
                                        </p>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <button
                                                onClick={() => setQty((q) => Math.max(1, q - 1))}
                                                style={{
                                                    width: 36, height: 36, borderRadius: t.buttonRadius,
                                                    border: `1px solid ${t.borderPrimary}`, background: t.bgSecondary,
                                                    color: t.textSecondary, cursor: "pointer",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                }}
                                            ><Minus style={{ width: 14, height: 14 }} /></button>

                                            <input
                                                type="number"
                                                min={1}
                                                max={Math.min(1000, selectedCat.availableStock)}
                                                value={qty}
                                                onChange={(e) => {
                                                    const v = Math.max(1, Math.min(1000, Math.min(selectedCat.availableStock, Number(e.target.value) || 1)));
                                                    setQty(v);
                                                }}
                                                style={{
                                                    width: 80, textAlign: "center", padding: "8px 12px",
                                                    borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`,
                                                    background: t.bgInput, color: t.textPrimary,
                                                    fontSize: "1rem", fontWeight: 800, fontFamily: t.fontMono, outline: "none",
                                                }}
                                            />

                                            <button
                                                onClick={() => setQty((q) => Math.min(1000, Math.min(selectedCat.availableStock, q + 1)))}
                                                style={{
                                                    width: 36, height: 36, borderRadius: t.buttonRadius,
                                                    border: `1px solid ${t.borderPrimary}`, background: t.bgSecondary,
                                                    color: t.textSecondary, cursor: "pointer",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                }}
                                            ><Plus style={{ width: 14, height: 14 }} /></button>

                                            <span style={{ fontSize: "0.75rem", color: t.textMuted }}>
                                                / {selectedCat.availableStock.toLocaleString()} available (max 1,000)
                                            </span>
                                        </div>
                                    </div>

                                    {/* Cost summary */}
                                    <div style={{
                                        padding: "14px 18px", borderRadius: t.buttonRadius,
                                        background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`,
                                        marginBottom: 20,
                                    }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                            <span style={{ fontSize: "0.82rem", color: t.textMuted }}>Unit price</span>
                                            <span style={{ fontSize: "0.82rem", color: t.textSecondary, fontWeight: 600 }}>{selectedCat.pricePerUnit.toLocaleString()} Cr</span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                            <span style={{ fontSize: "0.82rem", color: t.textMuted }}>Quantity</span>
                                            <span style={{ fontSize: "0.82rem", color: t.textSecondary, fontWeight: 600 }}>{qty}</span>
                                        </div>
                                        <div style={{ borderTop: `1px solid ${t.borderPrimary}`, paddingTop: 10, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                                            <span style={{ fontSize: "0.9rem", fontWeight: 800, color: t.textPrimary }}>Total</span>
                                            <span style={{ fontSize: "1.1rem", fontWeight: 900, color: t.accentPrimary }}>
                                                {(selectedCat.pricePerUnit * qty).toLocaleString()} Credits
                                            </span>
                                        </div>
                                    </div>

                                    {/* Error */}
                                    {purchaseErr && (
                                        <div style={{
                                            padding: "10px 14px", borderRadius: t.buttonRadius,
                                            background: t.statusErrorBg, border: `1px solid ${t.statusError}33`,
                                            color: t.statusError, fontSize: "0.82rem", marginBottom: 16,
                                            display: "flex", alignItems: "center", gap: 6,
                                        }}>
                                            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} /> {purchaseErr}
                                        </div>
                                    )}

                                    {/* Buy button */}
                                    <button
                                        onClick={handlePurchase}
                                        disabled={purchasing || selectedCat.availableStock === 0}
                                        style={{
                                            width: "100%", padding: "13px 0", borderRadius: t.cardRadius,
                                            background: t.isMono ? t.accentPrimary : "linear-gradient(135deg,#3b82f6,#2563eb)",
                                            color: t.isMono ? t.bgPrimary : "#fff",
                                            fontWeight: 800, fontSize: "0.95rem", border: "none",
                                            cursor: purchasing ? "not-allowed" : "pointer",
                                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                            opacity: purchasing || selectedCat.availableStock === 0 ? 0.6 : 1,
                                            transition: "all 0.15s",
                                        }}
                                    >
                                        <ShoppingCart style={{ width: 16, height: 16 }} />
                                        {purchasing ? "Processing..." : `Purchase ${qty} Item${qty > 1 ? "s" : ""}`}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
