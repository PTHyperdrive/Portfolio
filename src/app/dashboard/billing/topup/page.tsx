"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useCredits } from "@/components/CreditProvider";
import {
    Clock, DollarSign, ClipboardList, Shield, Gift,
    AlertTriangle, Check, X
} from "lucide-react";

// ── Credit packages ────────────────────────────────────────────────
const PACKAGES = [
    { credits: 40_000,  vnd: 40_000,   popular: false },
    { credits: 120_000, vnd: 110_000,  popular: true  },
    { credits: 250_000, vnd: 220_000,  popular: false },
    { credits: 500_000, vnd: 430_000,  popular: false },
    { credits: 1_000_000, vnd: 820_000, popular: false },
    { credits: 2_000_000, vnd: 1_500_000, popular: false },
];

const MIN_CREDITS = 40_000;

type PromoState = "idle" | "checking" | "applied" | "error";

export default function TopUpPage() {
    const t = useThemeTokens();
    const { credits: globalCredits, refresh: refreshCredits, adjust: adjustCredits } = useCredits();
    const [balance, setBalance] = useState(0);
    const [selected, setSelected] = useState<number | null>(120_000);
    const [custom, setCustom] = useState("");
    const [promoCode, setPromoCode] = useState("");
    const [promoState, setPromoState] = useState<PromoState>("idle");
    const [promoMsg, setPromoMsg] = useState("");
    const [promoBonus, setPromoBonus] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    useEffect(() => {
        setBalance(globalCredits);
    }, [globalCredits]);

    // Determine active credit amount
    const customAmt = parseInt(custom.replace(/\D/g, ""), 10) || 0;
    const selectedAmt = custom ? customAmt : (selected ?? 0);
    const total = selectedAmt + promoBonus;

    const showToast = (msg: string, type: "success" | "error") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const applyPromo = async () => {
        if (!promoCode.trim()) return;
        setPromoState("checking");
        setPromoMsg("");
        try {
            const res = await fetch("/api/billing/promo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: promoCode }),
            });
            const data = await res.json();
            if (!res.ok) {
                setPromoState("error");
                setPromoMsg(data.error ?? "Invalid promo code");
            } else {
                setPromoState("applied");
                setPromoBonus(data.creditsAdded);
                setPromoMsg(`+${data.creditsAdded.toLocaleString()} credits added`);
                adjustCredits(data.creditsAdded);
                refreshCredits();
                showToast(data.message, "success");
            }
        } catch {
            setPromoState("error");
            setPromoMsg("Failed to apply code");
        }
    };

    const handleSubmit = async () => {
        if (selectedAmt < MIN_CREDITS && !promoBonus) {
            showToast(`Minimum top-up is ${MIN_CREDITS.toLocaleString()} credits`, "error");
            return;
        }
        setSubmitting(true);
        // Mock payment success — replace with real gateway call
        await new Promise(r => setTimeout(r, 1200));
        showToast("Payment submitted! Credits will be added after confirmation.", "success");
        setSubmitting(false);
    };

    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Toast */}
            {toast && (
                <div style={{
                    position: "fixed", top: 24, right: 24, zIndex: 9999,
                    padding: "14px 20px", borderRadius: t.isMono ? 0 : 10, fontWeight: 600, fontSize: "0.875rem",
                    background: toast.type === "success" ? t.statusSuccessBg : t.statusErrorBg,
                    border: `1px solid ${toast.type === "success" ? t.statusSuccess : t.statusError}66`,
                    color: toast.type === "success" ? t.statusSuccess : t.statusError,
                    backdropFilter: "blur(8px)",
                    display: "flex", alignItems: "center", gap: 8,
                }}>
                    {toast.type === "success"
                        ? <Check style={{ width: 15, height: 15 }} />
                        : <X style={{ width: 15, height: 15 }} />}
                    {toast.msg}
                </div>
            )}

            {/* Breadcrumb + Header */}
            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>
                Dashboard &nbsp;&bull;&nbsp; <Link href="/dashboard/billing" style={{ color: t.textMuted, textDecoration: "none" }}>Billing</Link> &nbsp;&bull;&nbsp; Top Up
            </p>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary, marginBottom: 28 }}>Add Cloud Credits</h1>

            {/* Current Balance Badge */}
            <div style={{ ...card, display: "inline-flex", alignItems: "center", gap: 12, padding: "12px 20px", marginBottom: 28 }}>
                <Clock style={{ width: 18, height: 18, color: t.accentPrimary }} />
                <span style={{ color: t.textSecondary, fontSize: "0.875rem" }}>Current Balance:</span>
                <span style={{ fontWeight: 800, fontSize: "1rem", color: t.textPrimary }}>{balance.toLocaleString()}</span>
                <span style={{ color: t.textMuted, fontSize: "0.8rem" }}>Credits</span>
            </div>

            {/* Two-column grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>

                {/* ── LEFT: Top Up Details ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                    {/* Packages Grid */}
                    <div style={{ ...card, padding: 24 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                            <span style={{ width: 24, height: 24, borderRadius: "50%", background: t.accentPrimary, color: t.textInverse, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 800, flexShrink: 0 }}>1</span>
                            <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>Choose credit amount</p>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                            {PACKAGES.map(pkg => {
                                const isActive = !custom && selected === pkg.credits;
                                return (
                                    <button
                                        key={pkg.credits}
                                        onClick={() => { setSelected(pkg.credits); setCustom(""); }}
                                        style={{
                                            position: "relative", padding: "16px 14px", borderRadius: t.cardRadius, cursor: "pointer",
                                            textAlign: "left", border: isActive ? `2px solid ${t.accentPrimary}` : `2px solid ${t.borderPrimary}`,
                                            background: isActive ? t.accentPrimaryMuted : t.bgInput,
                                            transition: "all 0.15s",
                                        }}
                                    >
                                        {pkg.popular && (
                                            <span style={{ position: "absolute", top: -10, right: 10, background: t.accentPrimary, color: t.textInverse, fontSize: "0.65rem", fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>
                                                MOST POPULAR
                                            </span>
                                        )}
                                        <p style={{ fontWeight: 800, fontSize: "1.05rem", color: t.textPrimary, marginBottom: 4 }}>
                                            {pkg.credits.toLocaleString()}
                                        </p>
                                        <p style={{ fontSize: "0.75rem", color: t.textMuted }}>Credits</p>
                                        <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 6 }}>
                                            ~{pkg.vnd.toLocaleString()} ₫
                                        </p>
                                        {isActive && (
                                            <div style={{ position: "absolute", top: 10, right: 10, width: 18, height: 18, borderRadius: "50%", background: t.accentPrimary, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <Check style={{ width: 10, height: 10, color: "#fff" }} />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Custom amount */}
                        <div style={{ marginTop: 20 }}>
                            <p style={{ fontSize: "0.8rem", color: t.textMuted, marginBottom: 8 }}>
                                Add custom credit amount <span style={{ color: t.textMuted }}>( min {MIN_CREDITS.toLocaleString()} Credits)</span>
                            </p>
                            <div style={{ position: "relative" as const }}>
                                <input
                                    type="text"
                                    placeholder="e.g. 75000"
                                    value={custom}
                                    onChange={e => {
                                        const v = e.target.value.replace(/\D/g, "");
                                        setCustom(v);
                                        setSelected(null);
                                    }}
                                    style={{
                                        width: "100%", padding: "10px 14px 10px 42px",
                                        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
                                        borderRadius: t.isMono ? 0 : 8, color: t.textPrimary, fontSize: "0.9rem", outline: "none",
                                        boxSizing: "border-box",
                                    }}
                                />
                                <DollarSign style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: t.textMuted, pointerEvents: "none" }} />
                            </div>
                            {custom && customAmt < MIN_CREDITS && (
                                <p style={{ fontSize: "0.75rem", color: t.statusError, marginTop: 6 }}>
                                    Minimum is {MIN_CREDITS.toLocaleString()} credits
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Promo Code */}
                    <div style={{ ...card, padding: 24 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                            <span style={{ width: 24, height: 24, borderRadius: "50%", background: t.statusWarning, color: t.textInverse, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 800, flexShrink: 0 }}>2</span>
                            <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>Add promo code or voucher</p>
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                            <input
                                type="text"
                                placeholder="Enter promo code (e.g. LAUNCH25)"
                                value={promoCode}
                                onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoState("idle"); setPromoMsg(""); }}
                                disabled={promoState === "applied"}
                                style={{
                                    flex: 1, padding: "10px 14px",
                                    background: promoState === "applied" ? t.statusSuccessBg : t.bgInput,
                                    border: `1px solid ${promoState === "applied" ? `${t.statusSuccess}4d` : promoState === "error" ? `${t.statusError}4d` : t.borderPrimary}`,
                                    borderRadius: t.isMono ? 0 : 8, color: t.textPrimary, fontSize: "0.9rem", outline: "none",
                                    fontFamily: t.fontMono, letterSpacing: "0.05em",
                                }}
                            />
                            <button
                                onClick={applyPromo}
                                disabled={promoState === "applied" || promoState === "checking" || !promoCode.trim()}
                                style={{
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    padding: "10px 20px", borderRadius: t.buttonRadius, fontWeight: 700, fontSize: "0.875rem",
                                    background: promoState === "applied" ? t.statusSuccess : t.accentPrimary,
                                    color: t.textInverse, border: "none", cursor: "pointer",
                                    opacity: !promoCode.trim() ? 0.5 : 1,
                                    transition: "all 0.15s",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {promoState === "applied" && <Check style={{ width: 14, height: 14 }} />}
                                {promoState === "checking" ? "Checking…" : promoState === "applied" ? "Applied" : "Apply"}
                            </button>
                        </div>
                        {promoMsg && (
                            <p style={{ marginTop: 8, fontSize: "0.8rem", color: promoState === "applied" ? t.statusSuccess : t.statusError, display: "flex", alignItems: "center", gap: 6 }}>
                                {promoState === "applied"
                                    ? <Gift style={{ width: 14, height: 14 }} />
                                    : <AlertTriangle style={{ width: 14, height: 14 }} />}
                                {promoMsg}
                            </p>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Order Summary ── */}
                <div style={{ ...card, padding: 24, position: "sticky", top: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${t.borderSecondary}` }}>
                        <ClipboardList style={{ width: 18, height: 18, color: t.accentPrimary }} />
                        <p style={{ fontWeight: 800, color: t.textPrimary, fontSize: "1rem" }}>Order Summary</p>
                    </div>

                    {/* Line items */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.875rem", color: t.textSecondary }}>Credits subtotal</span>
                            <span style={{ fontWeight: 700, color: t.textPrimary }}>{selectedAmt.toLocaleString()}</span>
                        </div>
                        {promoBonus > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "0.875rem", color: t.statusSuccess, display: "flex", alignItems: "center", gap: 6 }}>
                                    <Gift style={{ width: 13, height: 13 }} /> Promo bonus
                                </span>
                                <span style={{ fontWeight: 700, color: t.statusSuccess }}>+{promoBonus.toLocaleString()}</span>
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div style={{ borderTop: `1px solid ${t.borderSecondary}`, paddingTop: 16, marginBottom: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <span style={{ fontSize: "0.875rem", color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Credits</span>
                            <span style={{ fontWeight: 900, fontSize: "1.5rem", color: t.textPrimary }}>{total.toLocaleString()}</span>
                        </div>
                        {selectedAmt > 0 && (
                            <p style={{ fontSize: "0.75rem", color: t.textMuted, textAlign: "right", marginTop: 4 }}>
                                ≈ {(selectedAmt * 1).toLocaleString()} ₫ estimated
                            </p>
                        )}
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || (selectedAmt < MIN_CREDITS && promoBonus === 0)}
                        style={{
                            width: "100%", padding: "13px 0", borderRadius: t.buttonRadius,
                            background: t.accentPrimary,
                            color: t.textInverse, fontWeight: 800, fontSize: "0.95rem",
                            border: "none", cursor: submitting ? "not-allowed" : "pointer",
                            opacity: (selectedAmt < MIN_CREDITS && promoBonus === 0) ? 0.5 : 1,
                            transition: "all 0.15s",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }}
                    >
                        {submitting ? (
                            <>Processing…</>
                        ) : (
                            <>
                                <Shield style={{ width: 16, height: 16 }} />
                                Submit Payment
                            </>
                        )}
                    </button>

                    <p style={{ fontSize: "0.72rem", color: t.textMuted, textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
                        Credits are added immediately after payment confirmation.
                    </p>
                </div>
            </div>
        </div>
    );
}
