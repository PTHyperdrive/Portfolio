"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { WINDOWS_ISOS, getIsosByCategory } from "@/lib/windows-isos";

// Plan pricing table
const PLAN_PRICES: Record<string, number> = {
    "Trial Plan": 0,
    "Cloud Starter": 4.99,
    "Cloud Gaming": 5.99,
    "Cloud Workstation": 49.99,
    "Enterprise": 149.99,
    "Anti-Detect VPS": 0,
};

export default function PaymentPage() {
    const params = useSearchParams();
    const router = useRouter();
    const { data: session } = useSession();

    const plan = params.get("plan") || "Cloud Starter";
    const price = PLAN_PRICES[plan] ?? 0;

    const userMeta = session?.user as Record<string, unknown> | undefined;
    const hasUsedTrial = userMeta?.hasUsedTrial === true;
    const isAdmin = userMeta?.role === "ADMIN";
    const isTrialLocked = plan === "Trial Plan" && hasUsedTrial && !isAdmin;

    const isoCategories = getIsosByCategory();
    const defaultIso = WINDOWS_ISOS[0].id as string;
    const [selectedIso, setSelectedIso] = useState<string>(defaultIso);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
    const [msg, setMsg] = useState("");

    // Redirect unauthenticated users
    useEffect(() => {
        if (session === null) router.replace("/auth/login");
    }, [session, router]);

    const handleDevBypass = async () => {
        setLoading(true);
        setStatus("processing");
        setMsg("");
        try {
            // 1. Record the simulated transaction & update active plan
            const res = await fetch("/api/payment/activate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan, amount: price }),
            });
            const data = await res.json();

            if (!res.ok) {
                setStatus("error");
                setMsg(data.error || "Activation failed");
                setLoading(false);
                return;
            }

            // 2. Provision the VM on Proxmox for all plans
            const provRes = await fetch("/api/proxmox/provision", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan, isoId: selectedIso }),
            });
            const provData = await provRes.json();
            if (!provRes.ok) {
                setStatus("error");
                setMsg(provData.error || "Payment succeeded but VM provisioning failed");
                setLoading(false);
                return;
            }

            setStatus("success");
            setMsg("Payment recorded! Redirecting to billing...");

            // Redirect using location.href to ensure a full page reload and NextAuth session refresh
            setTimeout(() => {
                window.location.href = "/dashboard/billing";
            }, 1500);
        } catch {
            setStatus("error");
            setMsg("Network error. Please try again.");
            setLoading(false);
        }
    };

    const handleCrypto = () => {
        setMsg("💡 Crypto payments coming soon. Use Dev Bypass for testing.");
    };

    return (
        <div style={{ paddingTop: "120px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: "680px" }}>
                {/* Header */}
                <div style={{ marginBottom: "40px" }}>
                    <span className="badge badge-cyan" style={{ marginBottom: "12px", display: "inline-block" }}>CHECKOUT</span>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                        Complete Your <span className="gradient-text">Order</span>
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                        You&apos;re one step away from activating your plan.
                    </p>
                </div>

                {/* Order Summary Card */}
                <div className="glass-card" style={{ padding: "28px", marginBottom: "24px" }}>
                    <h3 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "20px" }}>Order Summary</h3>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <div>
                            <p style={{ fontWeight: 700, fontSize: "1.05rem" }}>{plan}</p>
                            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "2px" }}>VPS Hosting Plan</p>
                        </div>
                        <span className="gradient-text" style={{ fontSize: "1.4rem", fontWeight: 800 }}>
                            {price === 0 ? "Free" : `$${price.toFixed(2)}`}
                        </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "16px" }}>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Total Due</span>
                        <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>
                            {price === 0 ? "$0.00" : `$${price.toFixed(2)}`}
                        </span>
                    </div>

                    {/* OS Selector */}
                    <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <label style={{ display: "block", fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Operating System
                        </label>
                        <select
                            value={selectedIso}
                            onChange={(e) => setSelectedIso(e.target.value)}
                            className="input-field"
                            style={{ width: "100%", cursor: "pointer" }}
                        >
                            {Object.entries(isoCategories).map(([category, isos]) => (
                                <optgroup key={category} label={category} style={{ color: "#000", background: "#fff" }}>
                                    {isos.map((iso) => (
                                        <option key={iso.id} value={iso.id} style={{ color: "#000", background: "#fff" }}>
                                            {iso.name}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "8px" }}>
                            You can reinstall a different OS anytime from your VM settings.
                        </p>
                    </div>
                </div>

                {/* Payment Methods */}
                <div className="glass-card" style={{ padding: "28px", marginBottom: "24px" }}>
                    <h3 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "20px" }}>Payment Method</h3>

                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {/* Bitcoin */}
                        <button
                            onClick={handleCrypto}
                            className="btn btn-secondary"
                            style={{ width: "100%", padding: "16px 24px", display: "flex", alignItems: "center", gap: "16px", justifyContent: "flex-start", fontSize: "0.95rem" }}
                        >
                            <span style={{ fontSize: "1.5rem" }}>₿</span>
                            <div style={{ textAlign: "left" }}>
                                <div style={{ fontWeight: 700 }}>Pay with Bitcoin</div>
                                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>Send BTC to our wallet address</div>
                            </div>
                            <span className="badge" style={{ marginLeft: "auto", background: "rgba(251,191,36,0.1)", color: "#FBBF24", fontSize: "0.7rem" }}>Coming Soon</span>
                        </button>

                        {/* Ethereum */}
                        <button
                            onClick={handleCrypto}
                            className="btn btn-secondary"
                            style={{ width: "100%", padding: "16px 24px", display: "flex", alignItems: "center", gap: "16px", justifyContent: "flex-start", fontSize: "0.95rem" }}
                        >
                            <span style={{ fontSize: "1.5rem" }}>Ξ</span>
                            <div style={{ textAlign: "left" }}>
                                <div style={{ fontWeight: 700 }}>Pay with Ethereum</div>
                                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>Send ETH or ERC-20 tokens</div>
                            </div>
                            <span className="badge" style={{ marginLeft: "auto", background: "rgba(139,92,246,0.1)", color: "var(--accent-purple)", fontSize: "0.7rem" }}>Coming Soon</span>
                        </button>
                    </div>
                </div>

                {/* Dev Bypass */}
                <div style={{ padding: "20px 24px", borderRadius: "var(--radius-sm)", border: "1px dashed rgba(0,240,255,0.2)", background: "rgba(0,240,255,0.03)", marginBottom: "24px" }}>
                    <p style={{ fontSize: "0.78rem", color: "var(--accent-cyan)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>🛠 Development Mode</p>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "14px" }}>Skip payment processing and mark this order as paid immediately.</p>
                    <button
                        onClick={handleDevBypass}
                        disabled={loading || isTrialLocked}
                        className="btn btn-primary"
                        style={{ width: "100%", padding: "14px", fontSize: "0.95rem" }}
                    >
                        {isTrialLocked ? "Trial Activated" : loading ? "Processing..." : "⚡ Dev Bypass: Mark as Paid"}
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
                        padding: "14px 18px",
                        borderRadius: "var(--radius-sm)",
                        background: status === "success" ? "rgba(0,255,136,0.08)" : status === "error" ? "rgba(255,0,110,0.08)" : "rgba(0,240,255,0.08)",
                        border: `1px solid ${status === "success" ? "rgba(0,255,136,0.2)" : status === "error" ? "rgba(255,0,110,0.2)" : "rgba(0,240,255,0.2)"}`,
                        color: status === "success" ? "var(--accent-green)" : status === "error" ? "var(--accent-magenta)" : "var(--accent-cyan)",
                        fontSize: "0.88rem",
                        marginBottom: "16px",
                    }}>
                        {msg}
                    </div>
                )}

                <Link href="/services/vps" style={{ color: "var(--text-muted)", fontSize: "0.85rem", textDecoration: "none" }}>
                    ← Back to Plans
                </Link>
            </div>
        </div>
    );
}
