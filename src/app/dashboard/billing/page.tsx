"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useCredits } from "@/components/CreditProvider";
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

interface ForecastData {
    credits: number;
    totalHourlySpent: number;
    totalVmHours: number;
    burn: { hourly: number; daily: number; weekly: number; monthly: number };
    runway: { hours: number | null; days: number | null; depletionAt: string | null };
    vms: { vmId: string; name: string; plan: string | null; status: string; burnPerHour: number }[];
}

export default function BillingPage() {
    const t = useThemeTokens();
    const [data, setData] = useState<BillingData | null>(null);
    const [forecast, setForecast] = useState<ForecastData | null>(null);
    const [loading, setLoading] = useState(true);
    const { credits: globalCredits } = useCredits();
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

        fetch("/api/billing/forecast")
            .then((r) => r.json())
            .then((d) => { if (!d.error) setForecast(d); })
            .catch(() => {});
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
                    <div style={{ padding: "14px 20px", borderRadius: t.cardRadius, background: t.statusErrorBg, color: t.statusError, marginBottom: "24px", fontSize: "0.9rem" }}>
                        {error}
                    </div>
                )}

                {/* Stats Row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginBottom: "32px" }}>
                    {/* Active Plan */}
                    <div style={{ ...card, padding: "24px", display: "flex", flexDirection: "column" }}>
                        <div style={{ width: 36, height: 36, borderRadius: t.cardRadius, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
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
                            <div style={{ width: 36, height: 36, borderRadius: t.cardRadius, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                                <CreditCard style={{ width: 18, height: 18, color: t.accentPrimary }} />
                            </div>
                            <p style={{ fontSize: "0.78rem", color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Current Balance</p>
                            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                                <p style={{ fontSize: "1.8rem", fontWeight: 800, color: t.textPrimary }}>
                                    {globalCredits.toLocaleString()}
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
                        <div style={{ width: 36, height: 36, borderRadius: t.cardRadius, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
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

                {/* Usage Forecast */}
                {forecast && (
                    <div style={{ ...card, padding: "28px", marginBottom: "32px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary }}>
                                Usage Forecast
                            </h3>
                            <span style={{ fontSize: "0.78rem", color: t.textMuted }}>
                                <strong style={{ color: t.textPrimary }}>{forecast.totalVmHours.toLocaleString()}</strong> VM-hours used
                                {" · "}
                                <strong style={{ color: t.textPrimary }}>{forecast.totalHourlySpent.toLocaleString()}</strong> credits spent
                            </span>
                        </div>
                        <p style={{ fontSize: "0.82rem", color: t.textMuted, marginBottom: "20px" }}>
                            {forecast.burn.hourly > 0
                                ? `Based on your ${forecast.vms.filter((v) => v.status === "running").length} running VM(s), billed hourly.`
                                : "No metered VMs running right now — hourly billing is paused."}
                        </p>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "16px", marginBottom: "20px" }}>
                            {([
                                ["Per hour", forecast.burn.hourly],
                                ["Per day", forecast.burn.daily],
                                ["Per week", forecast.burn.weekly],
                                ["Per month", forecast.burn.monthly],
                            ] as const).map(([label, val]) => (
                                <div key={label}>
                                    <p style={{ fontSize: "0.72rem", color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{label}</p>
                                    <p style={{ fontSize: "1.05rem", fontWeight: 800, color: t.textPrimary }}>
                                        {Math.round(val).toLocaleString()}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div style={{
                            padding: "14px 18px", borderRadius: t.cardRadius,
                            background: (forecast.runway.days ?? 99) <= 3 ? t.statusErrorBg : t.accentPrimaryMuted,
                            color: (forecast.runway.days ?? 99) <= 3 ? t.statusError : t.textSecondary,
                            fontSize: "0.88rem",
                        }}>
                            {forecast.runway.hours === null ? (
                                "No active hourly charges — start a VM and metering begins."
                            ) : (
                                <>
                                    <strong>{forecast.runway.days}d {forecast.runway.hours % 24}h</strong> of runway left
                                    {forecast.runway.depletionAt && ` — credits run out ${fmtDate(forecast.runway.depletionAt)}`}.
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Invoices Table */}
                <div style={{ ...card, padding: "28px" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "20px", color: t.textPrimary }}>Invoice History</h3>

                    {!data?.transactions.length ? (
                        <div style={{ textAlign: "center", padding: "40px 0" }}>
                            <div style={{ width: 56, height: 56, borderRadius: t.cardRadius, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
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
