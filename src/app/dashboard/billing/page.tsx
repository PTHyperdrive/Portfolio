"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
    totalSpent: number;
    transactions: Transaction[];
}

export default function BillingPage() {
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

    const statusColor = (status: string) =>
        status === "paid" ? "var(--accent-green)" : status === "pending" ? "#FBBF24" : "var(--accent-magenta)";

    if (loading) {
        return (
            <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: "var(--text-muted)" }}>Loading billing data...</p>
            </div>
        );
    }

    return (
        <div style={{ paddingTop: "120px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: "900px" }}>
                {/* Header */}
                <div style={{ marginBottom: "40px" }}>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                        Billing &amp; <span className="gradient-text">Payments</span>
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                        Manage your subscriptions, invoices, and payment history.
                    </p>
                </div>

                {error && (
                    <div style={{ padding: "14px 20px", borderRadius: "var(--radius-sm)", background: "rgba(255,0,110,0.1)", color: "var(--accent-magenta)", marginBottom: "24px", fontSize: "0.9rem" }}>
                        {error}
                    </div>
                )}

                {/* Stats Row */}
                <div className="grid-3" style={{ marginBottom: "32px", gap: "20px" }}>
                    {/* Active Plan */}
                    <div className="glass-card" style={{ padding: "24px" }}>
                        <div style={{ fontSize: "1.4rem", marginBottom: "8px" }}>🖥️</div>
                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Active Plan</p>
                        <p style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--accent-cyan)" }}>
                            {data?.activePlan ?? "None"}
                        </p>
                        {data?.planActivatedAt && (
                            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                                Since {fmtDate(data.planActivatedAt)}
                            </p>
                        )}
                    </div>

                    {/* Total Spent */}
                    <div className="glass-card" style={{ padding: "24px" }}>
                        <div style={{ fontSize: "1.4rem", marginBottom: "8px" }}>💰</div>
                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Total Spent</p>
                        <p className="gradient-text" style={{ fontSize: "1.4rem", fontWeight: 800 }}>
                            ${(data?.totalSpent ?? 0).toFixed(2)}
                        </p>
                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                            {data?.transactions.length ?? 0} invoice{(data?.transactions.length ?? 0) !== 1 ? "s" : ""}
                        </p>
                    </div>

                    {/* Upgrade CTA */}
                    <div className="glass-card" style={{ padding: "24px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
                        <div style={{ fontSize: "1.4rem", marginBottom: "8px" }}>🚀</div>
                        <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginBottom: "14px" }}>
                            Want more power?
                        </p>
                        <Link href="/services/vps" className="btn btn-primary" style={{ padding: "8px 20px", fontSize: "0.82rem" }}>
                            Upgrade Plan
                        </Link>
                    </div>
                </div>

                {/* Invoices Table */}
                <div className="glass-card" style={{ padding: "28px" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "20px" }}>Invoice History</h3>

                    {!data?.transactions.length ? (
                        <div style={{ textAlign: "center", padding: "40px 0" }}>
                            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>📄</div>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "16px" }}>No invoices yet.</p>
                            <Link href="/services/vps" className="btn btn-secondary" style={{ fontSize: "0.85rem" }}>Browse Plans</Link>
                        </div>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr>
                                        {["Date", "Plan", "Amount", "Method", "Status"].map((h) => (
                                            <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.transactions.map((tx) => (
                                        <tr key={tx.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                            <td style={{ padding: "14px 12px", fontSize: "0.85rem" }}>
                                                <div>{fmtDate(tx.createdAt)}</div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>{fmtTime(tx.createdAt)}</div>
                                            </td>
                                            <td style={{ padding: "14px 12px", fontSize: "0.85rem", fontWeight: 600 }}>{tx.plan}</td>
                                            <td style={{ padding: "14px 12px", fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                                ${Number(tx.amount).toFixed(2)}
                                            </td>
                                            <td style={{ padding: "14px 12px" }}>
                                                <span className="mono" style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                                                    {tx.method.replace(/_/g, " ")}
                                                </span>
                                            </td>
                                            <td style={{ padding: "14px 12px" }}>
                                                <span className="badge" style={{ background: `${statusColor(tx.status)}15`, color: statusColor(tx.status), fontSize: "0.72rem", textTransform: "capitalize" }}>
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
