"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
    Wallet, Clock, CheckCircle2, AlertTriangle, ShieldCheck, ShieldAlert,
    Copy, Loader2, ArrowLeft, Zap, ChevronDown,
} from "lucide-react";

/* ── Types ────────────────────────────────────────────────────── */

interface PricingData {
    plans: Record<string, {
        priceInCredits: number;
        resolvedPeriodPrices?: { hourly: number; daily: number; weekly: number; monthly: number };
    }>;
    exchangeRate: number;
}

type CryptoChain = "TRC20" | "ERC20";

interface TopupState {
    topupId: string;
    depositAddress: string;
    amountUsdt: number;
    creditAmount: number;
    chain: CryptoChain;
    expiresAt: string;
}

interface TopupStatus {
    status: "PENDING" | "CONFIRMING" | "COMPLETED" | "EXPIRED";
    confirmations: number;
    txHash: string | null;
    creditAmount: number;
}

type ClipboardVerification = "idle" | "match" | "mismatch" | "error";

/* ── Component ────────────────────────────────────────────────── */

export default function PaymentPage() {
    const params = useSearchParams();
    const router = useRouter();
    const { data: session } = useSession();

    const plan = params.get("plan") || "Cloud Starter";

    const userMeta = session?.user as Record<string, unknown> | undefined;
    const hasUsedTrial = userMeta?.hasUsedTrial === true;
    const isAdmin = userMeta?.role === "ADMIN";
    const isTrialLocked = plan === "Trial Plan" && hasUsedTrial && !isAdmin;

    /* ── State ────────────────────────────────────────────────── */
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
    const [msg, setMsg] = useState("");

    // Dynamic pricing
    const [pricing, setPricing] = useState<PricingData | null>(null);
    const [pricingLoading, setPricingLoading] = useState(true);

    // Crypto flow
    const [showCrypto, setShowCrypto] = useState(false);
    const [chain, setChain] = useState<CryptoChain>("TRC20");
    const [usdtAmount, setUsdtAmount] = useState(10);
    const [topup, setTopup] = useState<TopupState | null>(null);
    const [topupStatus, setTopupStatus] = useState<TopupStatus | null>(null);
    const [cryptoLoading, setCryptoLoading] = useState(false);
    const [clipboardCheck, setClipboardCheck] = useState<ClipboardVerification>("idle");
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Fetch dynamic pricing
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/admin/pricing");
                if (res.ok) {
                    const d = await res.json();
                    setPricing(d);
                }
            } catch { /* silent */ }
            finally { setPricingLoading(false); }
        })();
    }, []);

    // Redirect unauthenticated users
    useEffect(() => {
        if (session === null) router.replace("/auth/login");
    }, [session, router]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    /* ── Computed price (hourly is the only real charge) ──────── */
    const periods = pricing?.plans?.[plan]?.resolvedPeriodPrices;
    const hourlyRate = periods?.hourly ?? 0;
    const monthlyForecast = periods?.monthly ?? 0;
    const exchangeRate = pricing?.exchangeRate ?? 26305;
    const monthlyUsdt = monthlyForecast > 0 ? (monthlyForecast / exchangeRate).toFixed(2) : "0";

    /* ── Activate with credits ────────────────────────────────── */
    // The server resolves the price and charges the prepaid credit wallet —
    // the amount is never trusted from the client.
    const handleActivateWithCredits = async () => {
        setLoading(true);
        setStatus("processing");
        setMsg("");
        try {
            const res = await fetch("/api/payment/activate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan }),
            });
            const data = await res.json();

            if (!res.ok) {
                setStatus("error");
                setMsg(data.error || "Activation failed");
                setLoading(false);
                return;
            }

            setStatus("success");
            setMsg("Plan activated! Redirecting to billing...");
            setTimeout(() => { window.location.href = "/dashboard/billing"; }, 1500);
        } catch {
            setStatus("error");
            setMsg("Network error. Please try again.");
            setLoading(false);
        }
    };

    /* ── Crypto Top-up ────────────────────────────────────────── */
    const initiateCryptoTopup = async () => {
        setCryptoLoading(true);
        setMsg("");
        setClipboardCheck("idle");
        try {
            const res = await fetch("/api/payment/crypto/topup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amountUsdt: usdtAmount, chain }),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || "Failed to create top-up");
            }
            const data: TopupState = await res.json();
            setTopup(data);

            // Start polling for status
            pollRef.current = setInterval(() => pollTopupStatus(data.topupId), 5000);
        } catch (e) {
            setMsg(e instanceof Error ? e.message : "Failed");
        } finally {
            setCryptoLoading(false);
        }
    };

    const pollTopupStatus = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/payment/crypto/topup?topupId=${id}`);
            if (!res.ok) return;
            const data: TopupStatus = await res.json();
            setTopupStatus(data);

            if (data.status === "COMPLETED" || data.status === "EXPIRED") {
                if (pollRef.current) clearInterval(pollRef.current);
            }
        } catch { /* silent */ }
    }, []);

    /* ── Clipboard Anti-Clipjack ──────────────────────────────── */
    const copyAddress = async () => {
        if (!topup) return;
        try {
            await navigator.clipboard.writeText(topup.depositAddress);
            // Wait a moment then verify
            setTimeout(verifyClipboard, 500);
        } catch {
            setClipboardCheck("error");
        }
    };

    const verifyClipboard = async () => {
        if (!topup) return;
        try {
            const clipText = await navigator.clipboard.readText();
            const cleaned = clipText.trim();
            if (cleaned === topup.depositAddress) {
                setClipboardCheck("match");
            } else {
                setClipboardCheck("mismatch");
            }
        } catch {
            // Clipboard API not available or permission denied
            setClipboardCheck("error");
        }
    };

    /* ── Countdown timer ──────────────────────────────────────── */
    const [timeLeft, setTimeLeft] = useState("");
    useEffect(() => {
        if (!topup) return;
        const iv = setInterval(() => {
            const diff = new Date(topup.expiresAt).getTime() - Date.now();
            if (diff <= 0) {
                setTimeLeft("Expired");
                clearInterval(iv);
            } else {
                const m = Math.floor(diff / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setTimeLeft(`${m}:${s.toString().padStart(2, "0")}`);
            }
        }, 1000);
        return () => clearInterval(iv);
    }, [topup]);

    /* ── Render ───────────────────────────────────────────────── */

    return (
        <div style={{ paddingTop: "120px", paddingBottom: "80px", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div className="container" style={{ width: "100%", maxWidth: "680px", margin: "0 auto" }}>
                {/* Header */}
                <div style={{ marginBottom: "40px" }}>
                    <span className="badge badge-cyan" style={{ marginBottom: "12px", display: "inline-block" }}>
                        CHECKOUT
                    </span>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                        Complete Your <span className="gradient-text">Order</span>
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                        You&apos;re one step away from activating your plan.
                    </p>
                </div>

                {/* Order Summary Card */}
                <div className="glass-card" style={{ padding: "28px", marginBottom: "24px" }}>
                    <h3 style={{
                        fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)",
                        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "20px",
                    }}>
                        Order Summary
                    </h3>
                    <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}>
                        <div>
                            <p style={{ fontWeight: 700, fontSize: "1.05rem" }}>{plan}</p>
                            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                VPS Hosting Plan
                            </p>
                        </div>
                        <span className="gradient-text" style={{ fontSize: "1.4rem", fontWeight: 800 }}>
                            {pricingLoading ? "..." : hourlyRate === 0 ? "Free" : `${hourlyRate.toLocaleString()} Credits/hr`}
                        </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "16px" }}>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Est. monthly (forecast)</span>
                        <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>
                            {pricingLoading ? "..." : hourlyRate === 0
                                ? "$0.00"
                                : `${monthlyForecast.toLocaleString()} Credits (~$${monthlyUsdt})`}
                        </span>
                    </div>
                </div>

                {/* ── USDT Payment ─────────────────────────────── */}
                <div className="glass-card" style={{ padding: "28px", marginBottom: "24px" }}>
                    <h3 style={{
                        fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)",
                        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "20px",
                    }}>
                        Payment Method
                    </h3>

                    {!showCrypto && !topup ? (
                        <button
                            onClick={() => setShowCrypto(true)}
                            className="btn btn-secondary"
                            style={{
                                width: "100%", padding: "16px 24px", display: "flex",
                                alignItems: "center", gap: "16px", justifyContent: "flex-start",
                                fontSize: "0.95rem",
                            }}
                        >
                            <Wallet style={{ width: 24, height: 24 }} />
                            <div style={{ textAlign: "left" }}>
                                <div style={{ fontWeight: 700 }}>Pay with USDT</div>
                                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                    Tether USD on TRC-20 or ERC-20 network
                                </div>
                            </div>
                            <ChevronDown style={{ marginLeft: "auto", width: 16, height: 16 }} />
                        </button>
                    ) : !topup ? (
                        /* ── Chain selection + amount ────────────── */
                        <div>
                            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                                {(["TRC20", "ERC20"] as CryptoChain[]).map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setChain(c)}
                                        style={{
                                            flex: 1, padding: "12px", borderRadius: "var(--radius-sm)",
                                            border: `2px solid ${chain === c ? "var(--accent-cyan)" : "var(--glass-border)"}`,
                                            background: chain === c ? "rgba(0,240,255,0.06)" : "transparent",
                                            color: chain === c ? "var(--accent-cyan)" : "var(--text-secondary)",
                                            cursor: "pointer", fontWeight: 700, fontSize: "0.9rem",
                                            transition: "all 0.15s",
                                        }}
                                    >
                                        USDT {c === "TRC20" ? "TRC-20" : "ERC-20"}
                                        <div style={{ fontSize: "0.72rem", fontWeight: 400, marginTop: 4, color: "var(--text-muted)" }}>
                                            {c === "TRC20" ? "Tron network (lower fees)" : "Ethereum network"}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 6, display: "block" }}>
                                    Amount (USDT)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={usdtAmount}
                                    onChange={e => setUsdtAmount(parseFloat(e.target.value) || 0)}
                                    className="input-field"
                                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                                />
                                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 6 }}>
                                    = {(usdtAmount * exchangeRate).toLocaleString()} Credits
                                    (1 USDT = {exchangeRate.toLocaleString()} Credits)
                                </p>
                            </div>

                            <button
                                onClick={initiateCryptoTopup}
                                disabled={cryptoLoading || usdtAmount <= 0}
                                className="btn btn-primary"
                                style={{ width: "100%", padding: "14px", fontSize: "0.95rem" }}
                            >
                                {cryptoLoading ? (
                                    <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                                ) : (
                                    <Zap style={{ width: 16, height: 16 }} />
                                )}
                                Generate Deposit Address
                            </button>
                        </div>
                    ) : (
                        /* ── Deposit address display ─────────────── */
                        <div>
                            {/* Status banner */}
                            {topupStatus?.status === "COMPLETED" ? (
                                <div style={{
                                    padding: "14px 18px", borderRadius: "var(--radius-sm)",
                                    background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)",
                                    color: "var(--accent-green)", marginBottom: 16,
                                    display: "flex", alignItems: "center", gap: 10,
                                }}>
                                    <CheckCircle2 style={{ width: 18, height: 18 }} />
                                    <div>
                                        <p style={{ fontWeight: 700 }}>Payment Confirmed</p>
                                        <p style={{ fontSize: "0.82rem", opacity: 0.8 }}>
                                            {topupStatus.creditAmount.toLocaleString()} credits have been minted to your account.
                                        </p>
                                    </div>
                                </div>
                            ) : topupStatus?.status === "EXPIRED" || timeLeft === "Expired" ? (
                                <div style={{
                                    padding: "14px 18px", borderRadius: "var(--radius-sm)",
                                    background: "rgba(255,0,110,0.08)", border: "1px solid rgba(255,0,110,0.2)",
                                    color: "var(--accent-magenta)", marginBottom: 16,
                                    display: "flex", alignItems: "center", gap: 10,
                                }}>
                                    <AlertTriangle style={{ width: 18, height: 18 }} />
                                    <span style={{ fontWeight: 600 }}>
                                        This deposit address has expired. Please create a new top-up.
                                    </span>
                                </div>
                            ) : null}

                            {/* Chain badge + timer */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                                <span className="badge badge-cyan">{topup.chain === "TRC20" ? "USDT TRC-20" : "USDT ERC-20"}</span>
                                {topupStatus?.status !== "COMPLETED" && topupStatus?.status !== "EXPIRED" && (
                                    <span style={{
                                        display: "flex", alignItems: "center", gap: 6,
                                        fontSize: "0.82rem", color: "var(--accent-orange)", fontWeight: 600,
                                    }}>
                                        <Clock style={{ width: 14, height: 14 }} />
                                        {timeLeft}
                                    </span>
                                )}
                            </div>

                            {/* Amount */}
                            <div style={{
                                padding: "12px 16px", borderRadius: "var(--radius-sm)",
                                background: "rgba(255,255,255,0.03)", border: "1px solid var(--glass-border)",
                                marginBottom: 12,
                            }}>
                                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                                    Send exactly:
                                </p>
                                <p style={{
                                    fontSize: "1.4rem", fontWeight: 800,
                                    fontFamily: "'JetBrains Mono', monospace",
                                }}>
                                    <span className="gradient-text">{topup.amountUsdt}</span>
                                    <span style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginLeft: 8 }}>USDT</span>
                                </p>
                            </div>

                            {/* Deposit address */}
                            <div style={{
                                padding: "12px 16px", borderRadius: "var(--radius-sm)",
                                background: "rgba(255,255,255,0.03)", border: "1px solid var(--glass-border)",
                                marginBottom: 12,
                            }}>
                                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                                    To this address:
                                </p>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <code style={{
                                        flex: 1, fontSize: "0.82rem", wordBreak: "break-all",
                                        fontFamily: "'JetBrains Mono', monospace",
                                        color: "var(--text-primary)",
                                    }}>
                                        {topup.depositAddress}
                                    </code>
                                    <button
                                        onClick={copyAddress}
                                        title="Copy address"
                                        style={{
                                            padding: "6px 10px", borderRadius: "var(--radius-sm)",
                                            border: "1px solid var(--glass-border)",
                                            background: "transparent", color: "var(--accent-cyan)",
                                            cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                                            fontSize: "0.78rem", fontWeight: 600,
                                        }}
                                    >
                                        <Copy style={{ width: 14, height: 14 }} />
                                        Copy
                                    </button>
                                </div>
                            </div>

                            {/* ── Clipboard Integrity Check ──────── */}
                            {clipboardCheck === "match" && (
                                <div style={{
                                    padding: "10px 14px", borderRadius: "var(--radius-sm)",
                                    background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)",
                                    color: "var(--accent-green)", marginBottom: 12,
                                    display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem",
                                }}>
                                    <ShieldCheck style={{ width: 16, height: 16, flexShrink: 0 }} />
                                    <span style={{ fontWeight: 600 }}>
                                        Clipboard verified. The address matches.
                                    </span>
                                </div>
                            )}
                            {clipboardCheck === "mismatch" && (
                                <div style={{
                                    padding: "14px 16px", borderRadius: "var(--radius-sm)",
                                    background: "rgba(255,0,0,0.08)", border: "2px solid rgba(255,0,0,0.4)",
                                    color: "#ff4444", marginBottom: 12,
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                        <ShieldAlert style={{ width: 20, height: 20, flexShrink: 0 }} />
                                        <span style={{ fontWeight: 800, fontSize: "0.95rem" }}>
                                            CLIPBOARD COMPROMISED
                                        </span>
                                    </div>
                                    <p style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>
                                        Your clipboard contains a different address than what was displayed.
                                        Your system may be infected with clipboard-hijacking malware (clipjacker).
                                    </p>
                                    <p style={{ fontSize: "0.85rem", lineHeight: 1.6, marginTop: 8, fontWeight: 700 }}>
                                        DO NOT proceed with this transaction. Run a full antivirus/anti-malware
                                        scan on your device immediately.
                                    </p>
                                </div>
                            )}
                            {clipboardCheck !== "match" && clipboardCheck !== "mismatch" && topupStatus?.status !== "COMPLETED" && (
                                <button
                                    onClick={verifyClipboard}
                                    style={{
                                        width: "100%", padding: "8px 14px", marginBottom: 12,
                                        borderRadius: "var(--radius-sm)",
                                        border: "1px solid var(--glass-border)",
                                        background: "transparent",
                                        color: "var(--text-muted)", cursor: "pointer",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        gap: 6, fontSize: "0.82rem",
                                    }}
                                >
                                    <ShieldCheck style={{ width: 14, height: 14 }} />
                                    Verify Clipboard Integrity
                                </button>
                            )}

                            {/* Confirmation progress */}
                            {topupStatus && topupStatus.status !== "EXPIRED" && topupStatus.status !== "COMPLETED" && (
                                <div style={{
                                    padding: "10px 14px", borderRadius: "var(--radius-sm)",
                                    background: "rgba(0,240,255,0.04)", border: "1px solid rgba(0,240,255,0.1)",
                                    marginBottom: 12,
                                    display: "flex", alignItems: "center", gap: 8,
                                    color: "var(--accent-cyan)", fontSize: "0.82rem",
                                }}>
                                    <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                                    <span>
                                        {topupStatus.confirmations > 0
                                            ? `${topupStatus.confirmations} confirmation(s) received. Waiting for more...`
                                            : "Waiting for transaction on the blockchain..."}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Pay with credit balance */}
                <div style={{
                    padding: "20px 24px", borderRadius: "var(--radius-sm)",
                    border: "1px dashed rgba(0,240,255,0.2)",
                    background: "rgba(0,240,255,0.03)", marginBottom: "24px",
                }}>
                    <p style={{
                        fontSize: "0.78rem", color: "var(--accent-cyan)", fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px",
                        display: "flex", alignItems: "center", gap: 6,
                    }}>
                        <Wallet style={{ width: 14, height: 14 }} />
                        Pay with Credit Balance
                    </p>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "14px" }}>
                        {hourlyRate === 0
                            ? "Activate this plan instantly — no charge."
                            : `No upfront cost — ${hourlyRate.toLocaleString()} credits/hour metered from your wallet only while your VM runs.`}
                    </p>
                    <button
                        onClick={handleActivateWithCredits}
                        disabled={loading || isTrialLocked}
                        className="btn btn-primary"
                        style={{ width: "100%", padding: "14px", fontSize: "0.95rem" }}
                    >
                        {isTrialLocked ? "Trial Activated" : loading ? "Processing..." : (
                            <>
                                <Zap style={{ width: 16, height: 16 }} />
                                {hourlyRate === 0 ? "Activate Plan" : "Start Hourly Billing"}
                            </>
                        )}
                    </button>
                    {isTrialLocked && (
                        <p style={{ fontSize: "0.8rem", color: "var(--accent-magenta)", marginTop: "12px", textAlign: "center" }}>
                            You have already claimed your one-time free trial.
                        </p>
                    )}
                </div>

                {/* Status message */}
                {msg && (
                    <div style={{
                        padding: "14px 18px", borderRadius: "var(--radius-sm)",
                        background: status === "success" ? "rgba(0,255,136,0.08)"
                            : status === "error" ? "rgba(255,0,110,0.08)"
                            : "rgba(0,240,255,0.08)",
                        border: `1px solid ${status === "success" ? "rgba(0,255,136,0.2)"
                            : status === "error" ? "rgba(255,0,110,0.2)"
                            : "rgba(0,240,255,0.2)"}`,
                        color: status === "success" ? "var(--accent-green)"
                            : status === "error" ? "var(--accent-magenta)"
                            : "var(--accent-cyan)",
                        fontSize: "0.88rem", marginBottom: "16px",
                    }}>
                        {msg}
                    </div>
                )}

                <Link href="/services/vps" style={{ color: "var(--text-muted)", fontSize: "0.85rem", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                    <ArrowLeft style={{ width: 14, height: 14 }} /> Back to Plans
                </Link>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
