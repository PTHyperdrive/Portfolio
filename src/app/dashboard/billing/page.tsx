"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Monitor, CreditCard, Rocket, FileText } from "lucide-react";

interface Transaction {
    id: string;
    plan: string;
    amount: string | number;
    method: string;
    status: string;
    createdAt: string;
}

interface BillingData {
    activePlan: string | null;
    planActivatedAt: string | null;
    trialExpiresAt: string | null;
    totalSpent: number;
    vpsCount: number;
    credits: number;
    transactions: Transaction[];
}

export default function BillingPage() {
    const t = useThemeTokens();
    const [data, setData] = useState<BillingData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch("/api/payment/history")
            .then((r) => r.json())
            .then((d) => {
                if (d.error) throw new Error(d.error);
                setData(d);
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    const fmtDate = (s: string) =>
        new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

    const fmtTime = (s: string) =>
        new Date(s).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    const expirationText = (() => {
        if (!data?.activePlan) return null;
        if (data.activePlan === "Trial Plan" && data.trialExpiresAt) {
            return `Expires on ${fmtDate(data.trialExpiresAt)}`;
        }
        if (data.planActivatedAt) {
            const d = new Date(data.planActivatedAt);
            d.setMonth(d.getMonth() + 1);
            return `Renews on ${fmtDate(d.toISOString())}`;
        }
        return null;
    })();

    const statusColor = (status: string) =>
        status === "paid" ? t.statusSuccess : status === "pending" ? t.statusWarning : t.statusError;

    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };

    if (loading) {
        return (
            <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: t.bgPrimary }}>
                <p style={{ color: t.textMuted }}>Loading billing data...</p>
            </div>
        );
    }

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>

            {/* Breadcrumb */}
            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 24 }}>
                Dashboard &nbsp;&bull;&nbsp; Billing
            </p>

            <div style={{ maxWidth: 900 }}>
                {/* Header */}
                <div style={{ marginBottom: "40px" }}>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "8px", color: t.textPrimary }}>
                        Billing & Payments
                    </h1>
                    <p style={{ color: t.textMuted, fontSize: "0.88rem" }}>
                        Manage your subscriptions, invoices, and payment history.
                    </p>
                </div>

                {error && (
                    <div style={{ padding: "14px 20px", borderRadius: t.isMono ? 4 : 8, background: t.statusErrorBg, color: t.statusError, marginBottom: "24px", fontSize: "0.9rem" }}>
                        {error}
                    </div>
                )}

                {/* Stats Row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "32px" }}>
                    {/* Active Plan */}
                    <div style={{ ...card, padding: "24px", display: "flex", flexDirection: "column" }}>
                        <div style={{ width: 36, height: 36, borderRadius: t.isMono ? 8 : 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                            <Monitor style={{ width: 18, height: 18, color: t.accentPrimary }} />
                        </div>
                        <p style={{ fontSize: "0.78rem", color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Active Plan</p>
                        <p style={{ fontSize: "1.1rem", fontWeight: 800, color: t.accentPrimary }}>
                            {data?.activePlan ?? "None"}
                        </p>
                        {data?.planActivatedAt && (
                            <>
                                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: "4px" }}>
                                    Since {fmtDate(data.planActivatedAt)}
                                </p>
                                {expirationText && (
                                    <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: "2px", fontWeight: 700 }}>
                                        {expirationText}
                                    </p>
                                )}
                            </>
                        )}

                        {/* Deploy action area */}
                        <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: `1px solid ${t.borderSecondary}` }}>
                            {data?.vpsCount === 0 ? (
                                <>
                                    <p style={{ fontSize: "0.82rem", color: t.textMuted, marginBottom: "12px", lineHeight: "1.4" }}>
                                        Ready to launch your first server?
                                    </p>
                                    <Link
                                        href="/dashboard/compute/new"
                                        style={{
                                            width: "100%", display: "block", textAlign: "center", padding: "10px",
                                            fontSize: "0.85rem", textDecoration: "none", borderRadius: t.buttonRadius,
                                            background: t.accentPrimary, color: t.textInverse, fontWeight: 700,
                                        }}
                                    >
                                        Deploy Now
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <p style={{ fontSize: "0.85rem", color: t.statusError, lineHeight: "1.4" }}>
                                        You have {data?.vpsCount} active VM{(data?.vpsCount ?? 0) > 1 ? "s" : ""}.
                                    </p>
                                    <Link href="/dashboard/vps" style={{
                                        marginTop: "12px", width: "100%", display: "block", padding: "8px",
                                        fontSize: "0.85rem", textDecoration: "none", textAlign: "center",
                                        borderRadius: t.buttonRadius, border: `1px solid ${t.accentPrimary}`,
                                        background: "transparent", color: t.accentPrimary, fontWeight: 600,
                                    }}>
                                        Manage Instances
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Current Balance */}
                    <div style={{ ...card, padding: "24px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                            <div style={{ width: 36, height: 36, borderRadius: t.isMono ? 8 : 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                                <CreditCard style={{ width: 18, height: 18, color: t.accentPrimary }} />
                            </div>
                            <p style={{ fontSize: "0.78rem", color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Current Balance</p>
                            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                                <p style={{ fontSize: "1.8rem", fontWeight: 800, color: t.textPrimary }}>
                                    {(data?.credits ?? 0).toLocaleString()}
                                </p>
                                <span style={{ fontSize: "0.85rem", color: t.textSecondary, fontWeight: 600 }}>VND</span>
                            </div>
                        </div>
                        <Link href="/dashboard/billing/topup" style={{
                            marginTop: "24px", width: "100%", display: "block", textAlign: "center",
                            padding: "10px", fontSize: "0.85rem", textDecoration: "none",
                            borderRadius: t.buttonRadius, background: t.accentPrimary,
                            color: t.textInverse, fontWeight: 700,
                        }}>
                            Top Up Balance
                        </Link>
                    </div>

                    {/* Upgrade CTA */}
                    <div style={{ ...card, padding: "24px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
                        <div style={{ width: 36, height: 36, borderRadius: t.isMono ? 8 : 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                            <Rocket style={{ width: 18, height: 18, color: t.accentPrimary }} />
                        </div>
                        <p style={{ fontSize: "0.88rem", color: t.textSecondary, marginBottom: "14px" }}>
                            Want more power?
                        </p>
                        <Link href="/services/vps" style={{
                            padding: "8px 20px", fontSize: "0.82rem", textDecoration: "none",
                            borderRadius: t.buttonRadius, background: t.accentPrimary,
                            color: t.textInverse, fontWeight: 700,
                        }}>
                            Upgrade Plan
                        </Link>
                    </div>
                </div>

                {/* Invoices Table */}
                <div style={{ ...card, padding: "28px" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "20px", color: t.textPrimary }}>Invoice History</h3>

                    {!data?.transactions.length ? (
                        <div style={{ textAlign: "center", padding: "40px 0" }}>
                            <div style={{ width: 56, height: 56, borderRadius: t.isMono ? 12 : 16, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                                <FileText style={{ width: 24, height: 24, color: t.accentPrimary }} />
                            </div>
                            <p style={{ color: t.textMuted, fontSize: "0.9rem", marginBottom: "16px" }}>No invoices yet.</p>
                            <Link href="/services/vps" style={{
                                display: "inline-block", padding: "8px 20px", borderRadius: t.buttonRadius,
                                border: `1px solid ${t.accentPrimary}`, background: "transparent",
                                color: t.accentPrimary, fontWeight: 600, fontSize: "0.85rem", textDecoration: "none",
                            }}>
                                Browse Plans
                            </Link>
                        </div>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr>
                                        {["Date", "Plan", "Amount", "Method", "Status"].map((h) => (
                                            <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: "0.75rem", color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${t.borderSecondary}` }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.transactions.map((tx) => (
                                        <tr key={tx.id} style={{ borderBottom: `1px solid ${t.borderSecondary}` }}>
                                            <td style={{ padding: "14px 12px", fontSize: "0.85rem", color: t.textPrimary }}>
                                                <div>{fmtDate(tx.createdAt)}</div>
                                                <div style={{ fontSize: "0.75rem", color: t.textMuted, marginTop: "2px" }}>{fmtTime(tx.createdAt)}</div>
                                            </td>
                                            <td style={{ padding: "14px 12px", fontSize: "0.85rem", fontWeight: 600, color: t.textPrimary }}>{tx.plan}</td>
                                            <td style={{ padding: "14px 12px", fontSize: "0.85rem", fontWeight: 700, color: t.textPrimary }}>
                                                ${Number(tx.amount).toFixed(2)}
                                            </td>
                                            <td style={{ padding: "14px 12px" }}>
                                                <span style={{ fontSize: "0.8rem", color: t.textMuted, textTransform: "capitalize", fontFamily: t.fontMono }}>
                                                    {tx.method.replace(/_/g, " ")}
                                                </span>
                                            </td>
                                            <td style={{ padding: "14px 12px" }}>
                                                <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: `${statusColor(tx.status)}1a`, color: statusColor(tx.status), textTransform: "capitalize" }}>
                                                    {tx.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
