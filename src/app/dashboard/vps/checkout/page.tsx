"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { VPS_PLANS, OS_OPTIONS, type VpsPlan, type OsOption } from "@/lib/vps-plans";

export default function VpsCheckoutPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const planId = searchParams.get("plan") || "standard";

    const [plan, setPlan] = useState<VpsPlan | null>(null);
    const [selectedOs, setSelectedOs] = useState<OsOption>(OS_OPTIONS[0]);
    const [vmName, setVmName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Fake payment form state
    const [cardName, setCardName] = useState("");
    const [cardNumber, setCardNumber] = useState("");
    const [expiry, setExpiry] = useState("");
    const [cvv, setCvv] = useState("");

    useEffect(() => {
        const p = VPS_PLANS.find((x) => x.id === planId) || VPS_PLANS[1];
        setPlan(p);
        setVmName(`my-${p.id}-vps`);
    }, [planId]);

    if (!plan) return null;

    const formatCard = (v: string) =>
        v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();

    const formatExpiry = (v: string) =>
        v.replace(/\D/g, "").slice(0, 4).replace(/^(\d{2})(\d)/, "$1/$2");

    const handlePurchase = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (!plan.negotiate) {
            if (!cardName.trim()) { setError("Card name is required"); return; }
            if (cardNumber.replace(/\s/g, "").length < 16) { setError("Enter a valid 16-digit card number"); return; }
            if (!expiry.includes("/")) { setError("Enter expiry as MM/YY"); return; }
            if (cvv.length < 3) { setError("Enter a valid CVV"); return; }
        }
        if (!vmName.trim()) { setError("VM name is required"); return; }

        setLoading(true);
        try {
            const res = await fetch("/api/vps/purchase", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId: plan.id, osId: selectedOs.id, vmName }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Purchase failed");

            setSuccess(data.message || "VM provisioned successfully!");
            setTimeout(() => router.push("/dashboard/vps"), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Purchase failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ paddingTop: "120px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: "900px" }}>

                {/* Breadcrumb */}
                <div style={{ marginBottom: "32px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    <Link href="/dashboard/vps" style={{ color: "var(--accent-cyan)", textDecoration: "none" }}>VPS Dashboard</Link>
                    {" / "}Checkout
                </div>

                <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                    Get Your <span className="gradient-text">VPS</span>
                </h1>
                <p style={{ color: "var(--text-muted)", marginBottom: "40px" }}>
                    {plan.negotiate
                        ? "Fill in your details and our team will provision a custom VM for you."
                        : "Complete your order below. This is a simulated payment — no real charges will be made."}
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "28px", alignItems: "start" }}>

                    {/* LEFT: Form */}
                    <form onSubmit={handlePurchase} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

                        {/* OS Selector */}
                        {!plan.negotiate && (
                            <div className="glass-card" style={{ padding: "24px" }}>
                                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "16px" }}>Select Operating System</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                    {OS_OPTIONS.map((os) => (
                                        <button
                                            key={os.id}
                                            type="button"
                                            onClick={() => setSelectedOs(os)}
                                            style={{
                                                padding: "12px 16px",
                                                borderRadius: "var(--radius-sm)",
                                                border: `1px solid ${selectedOs.id === os.id ? "var(--accent-cyan)" : "var(--glass-border)"}`,
                                                background: selectedOs.id === os.id ? "rgba(0,240,255,0.08)" : "rgba(255,255,255,0.03)",
                                                color: "var(--text-primary)",
                                                cursor: "pointer",
                                                textAlign: "left",
                                                transition: "all 0.2s",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "10px",
                                                fontSize: "0.85rem",
                                                fontWeight: selectedOs.id === os.id ? 600 : 400,
                                            }}
                                        >
                                            <span style={{ fontSize: "1.2rem" }}>{os.icon}</span>
                                            {os.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* VM Name */}
                        <div className="glass-card" style={{ padding: "24px" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "16px" }}>VM Configuration</h3>
                            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                VM Name
                            </label>
                            <input
                                value={vmName}
                                onChange={(e) => setVmName(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                                placeholder="my-awesome-vps"
                                required
                                style={{
                                    width: "100%",
                                    padding: "12px 16px",
                                    borderRadius: "var(--radius-sm)",
                                    border: "1px solid var(--glass-border)",
                                    background: "rgba(255,255,255,0.04)",
                                    color: "var(--text-primary)",
                                    fontSize: "0.95rem",
                                    boxSizing: "border-box",
                                    outline: "none",
                                }}
                            />
                            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "6px" }}>
                                Alphanumeric and hyphens only
                            </p>
                        </div>

                        {/* Simulated Payment Form */}
                        {!plan.negotiate && (
                            <div className="glass-card" style={{ padding: "24px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                                    <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Payment Details</h3>
                                    <span style={{
                                        padding: "2px 8px",
                                        borderRadius: "20px",
                                        fontSize: "0.7rem",
                                        fontWeight: 700,
                                        background: "rgba(255, 200, 0, 0.15)",
                                        color: "#ffc800",
                                        border: "1px solid rgba(255,200,0,0.3)",
                                        letterSpacing: "0.5px",
                                    }}>
                                        🔒 SIMULATED
                                    </span>
                                </div>
                                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "20px" }}>
                                    No real payment is processed. Enter any values to proceed.
                                </p>

                                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                                    <div>
                                        <label style={{ display: "block", marginBottom: "6px", fontSize: "0.82rem", color: "var(--text-muted)" }}>Name on Card</label>
                                        <input
                                            value={cardName}
                                            onChange={(e) => setCardName(e.target.value)}
                                            placeholder="John Doe"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: "block", marginBottom: "6px", fontSize: "0.82rem", color: "var(--text-muted)" }}>Card Number</label>
                                        <input
                                            value={cardNumber}
                                            onChange={(e) => setCardNumber(formatCard(e.target.value))}
                                            placeholder="4242 4242 4242 4242"
                                            maxLength={19}
                                            className="mono"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                        <div>
                                            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.82rem", color: "var(--text-muted)" }}>Expiry</label>
                                            <input
                                                value={expiry}
                                                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                                                placeholder="MM/YY"
                                                maxLength={5}
                                                className="mono"
                                                style={inputStyle}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.82rem", color: "var(--text-muted)" }}>CVV</label>
                                            <input
                                                value={cvv}
                                                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                                placeholder="123"
                                                maxLength={4}
                                                className="mono"
                                                style={inputStyle}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Errors / Success */}
                        {error && (
                            <div style={{ padding: "12px 16px", borderRadius: "var(--radius-sm)", background: "rgba(255,0,110,0.1)", border: "1px solid rgba(255,0,110,0.25)", color: "var(--accent-magenta)", fontSize: "0.88rem" }}>
                                {error}
                            </div>
                        )}
                        {success && (
                            <div style={{ padding: "12px 16px", borderRadius: "var(--radius-sm)", background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.25)", color: "var(--accent-green)", fontSize: "0.88rem" }}>
                                ✅ {success} — Redirecting…
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !!success}
                            className="btn btn-primary"
                            style={{ padding: "16px", fontSize: "1rem", fontWeight: 700, borderRadius: "var(--radius-sm)" }}
                        >
                            {loading
                                ? "Provisioning VM…"
                                : plan.negotiate
                                    ? "Submit Request"
                                    : `Pay $${plan.price}/mo & Deploy`}
                        </button>

                        <Link href="/dashboard/vps" style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", textDecoration: "none" }}>
                            ← Cancel and go back
                        </Link>
                    </form>

                    {/* RIGHT: Order Summary */}
                    <div style={{ position: "sticky", top: "100px" }}>
                        <div className="glass-card" style={{ padding: "28px", border: `1px solid ${plan.color}33` }}>
                            <div style={{ textAlign: "center", marginBottom: "20px" }}>
                                <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>{plan.icon}</div>
                                <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>{plan.name}</h2>
                                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{plan.tagline}</p>
                            </div>

                            {!plan.negotiate ? (
                                <>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                                        {[
                                            ["vCPU", `${plan.specs.vcpu} Cores`],
                                            ["RAM", `${plan.specs.ram_gb} GB`],
                                            ["Disk", `${plan.specs.disk_gb} GB NVMe`],
                                            ["Bandwidth", plan.specs.bandwidth],
                                            ["OS", selectedOs.icon + " " + selectedOs.label],
                                        ].map(([k, v]) => (
                                            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                                                <span style={{ color: "var(--text-muted)" }}>{k}</span>
                                                <span style={{ fontWeight: 600 }}>{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ color: "var(--text-muted)" }}>Total / month</span>
                                        <span style={{ fontSize: "1.6rem", fontWeight: 800, color: plan.color }}>
                                            ${plan.price}
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.7 }}>
                                    Submit your request and our team will contact you within 24 hours to discuss custom specs, pricing, and SLA.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--glass-border)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--text-primary)",
    fontSize: "0.92rem",
    boxSizing: "border-box",
    outline: "none",
};
