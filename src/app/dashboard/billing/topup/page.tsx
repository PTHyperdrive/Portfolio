"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
        fetch("/api/overview").then(r => r.json()).then(d => {
            if (d.user) setBalance(d.user.credits ?? 0);
        });
    }, []);

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
                setBalance(b => b + data.creditsAdded);
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

    const bg = "#0d1117";
    const card: React.CSSProperties = { background: "#161b22", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14 };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: bg }}>
            {/* Toast */}
            {toast && (
                <div style={{
                    position: "fixed", top: 24, right: 24, zIndex: 9999,
                    padding: "14px 20px", borderRadius: 10, fontWeight: 600, fontSize: "0.875rem",
                    background: toast.type === "success" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                    border: `1px solid ${toast.type === "success" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
                    color: toast.type === "success" ? "#10b981" : "#ef4444",
                    backdropFilter: "blur(8px)",
                }}>
                    {toast.type === "success" ? "✓" : "✕"} {toast.msg}
                </div>
            )}

            {/* Breadcrumb + Header */}
            <p style={{ fontSize: "0.78rem", color: "#475569", marginBottom: 6 }}>
                Dashboard &nbsp;•&nbsp; <Link href="/dashboard/billing" style={{ color: "#475569", textDecoration: "none" }}>Billing</Link> &nbsp;•&nbsp; Top Up
            </p>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f1f5f9", marginBottom: 28 }}>Add Cloud Credits</h1>

            {/* Current Balance Badge */}
            <div style={{ ...card, display: "inline-flex", alignItems: "center", gap: 12, padding: "12px 20px", marginBottom: 28 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
                <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Current Balance:</span>
                <span style={{ fontWeight: 800, fontSize: "1rem", color: "#f1f5f9" }}>{balance.toLocaleString()}</span>
                <span style={{ color: "#475569", fontSize: "0.8rem" }}>Credits</span>
            </div>

            {/* Two-column grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>

                {/* ── LEFT: Top Up Details ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                    {/* Packages Grid */}
                    <div style={{ ...card, padding: 24 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#3b82f6", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 800, flexShrink: 0 }}>1</span>
                            <p style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.95rem" }}>Choose credit amount</p>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                            {PACKAGES.map(pkg => {
                                const isActive = !custom && selected === pkg.credits;
                                return (
                                    <button
                                        key={pkg.credits}
                                        onClick={() => { setSelected(pkg.credits); setCustom(""); }}
                                        style={{
                                            position: "relative", padding: "16px 14px", borderRadius: 12, cursor: "pointer",
                                            textAlign: "left", border: isActive ? "2px solid #3b82f6" : "2px solid rgba(255,255,255,0.08)",
                                            background: isActive ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.02)",
                                            transition: "all 0.15s",
                                        }}
                                    >
                                        {pkg.popular && (
                                            <span style={{ position: "absolute", top: -10, right: 10, background: "#3b82f6", color: "#fff", fontSize: "0.65rem", fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>
                                                MOST POPULAR
                                            </span>
                                        )}
                                        <p style={{ fontWeight: 800, fontSize: "1.05rem", color: "#f1f5f9", marginBottom: 4 }}>
                                            {pkg.credits.toLocaleString()}
                                        </p>
                                        <p style={{ fontSize: "0.75rem", color: "#64748b" }}>Credits</p>
                                        <p style={{ fontSize: "0.78rem", color: "#475569", marginTop: 6 }}>
                                            ~{pkg.vnd.toLocaleString()} ₫
                                        </p>
                                        {isActive && (
                                            <div style={{ position: "absolute", top: 10, right: 10, width: 18, height: 18, borderRadius: "50%", background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Custom amount */}
                        <div style={{ marginTop: 20 }}>
                            <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: 8 }}>
                                Add custom credit amount <span style={{ color: "#475569" }}>(min {MIN_CREDITS.toLocaleString()} Credits)</span>
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
                                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: 8, color: "#e2e8f0", fontSize: "0.9rem", outline: "none",
                                        boxSizing: "border-box",
                                    }}
                                />
                                <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                            </div>
                            {custom && customAmt < MIN_CREDITS && (
                                <p style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: 6 }}>
                                    Minimum is {MIN_CREDITS.toLocaleString()} credits
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Promo Code */}
                    <div style={{ ...card, padding: 24 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#f59e0b", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 800, flexShrink: 0 }}>2</span>
                            <p style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.95rem" }}>Add promo code or voucher</p>
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
                                    background: promoState === "applied" ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.04)",
                                    border: `1px solid ${promoState === "applied" ? "rgba(16,185,129,0.3)" : promoState === "error" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
                                    borderRadius: 8, color: "#e2e8f0", fontSize: "0.9rem", outline: "none",
                                    fontFamily: "monospace", letterSpacing: "0.05em",
                                }}
                            />
                            <button
                                onClick={applyPromo}
                                disabled={promoState === "applied" || promoState === "checking" || !promoCode.trim()}
                                style={{
                                    padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: "0.875rem",
                                    background: promoState === "applied" ? "#10b981" : "#3b82f6",
                                    color: "#fff", border: "none", cursor: "pointer",
                                    opacity: !promoCode.trim() ? 0.5 : 1,
                                    transition: "all 0.15s",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {promoState === "checking" ? "Checking…" : promoState === "applied" ? "✓ Applied" : "Apply"}
                            </button>
                        </div>
                        {promoMsg && (
                            <p style={{ marginTop: 8, fontSize: "0.8rem", color: promoState === "applied" ? "#10b981" : "#ef4444" }}>
                                {promoState === "applied" ? "🎉 " : "⚠ "}{promoMsg}
                            </p>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Order Summary ── */}
                <div style={{ ...card, padding: 24, position: "sticky", top: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg>
                        <p style={{ fontWeight: 800, color: "#f1f5f9", fontSize: "1rem" }}>Order Summary</p>
                    </div>

                    {/* Line items */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.875rem", color: "#94a3b8" }}>Credits subtotal</span>
                            <span style={{ fontWeight: 700, color: "#f1f5f9" }}>{selectedAmt.toLocaleString()}</span>
                        </div>
                        {promoBonus > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "0.875rem", color: "#10b981" }}>🎉 Promo bonus</span>
                                <span style={{ fontWeight: 700, color: "#10b981" }}>+{promoBonus.toLocaleString()}</span>
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16, marginBottom: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <span style={{ fontSize: "0.875rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Credits</span>
                            <span style={{ fontWeight: 900, fontSize: "1.5rem", color: "#f1f5f9" }}>{total.toLocaleString()}</span>
                        </div>
                        {selectedAmt > 0 && (
                            <p style={{ fontSize: "0.75rem", color: "#475569", textAlign: "right", marginTop: 4 }}>
                                ≈ {(selectedAmt * 1).toLocaleString()} ₫ estimated
                            </p>
                        )}
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || (selectedAmt < MIN_CREDITS && promoBonus === 0)}
                        style={{
                            width: "100%", padding: "13px 0", borderRadius: 10,
                            background: submitting ? "#1d4ed8" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                            color: "#fff", fontWeight: 800, fontSize: "0.95rem",
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
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                                Submit Payment
                            </>
                        )}
                    </button>

                    <p style={{ fontSize: "0.72rem", color: "#475569", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
                        Credits are added immediately after payment confirmation.
                    </p>
                </div>
            </div>
        </div>
    );
}
