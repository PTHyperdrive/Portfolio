"use client";

import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Package } from "lucide-react";

export default function OrdersPage() {
    const t = useThemeTokens();

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>Dashboard &bull; Orders</p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>
                    Order <span style={{ color: t.accentPrimary }}>History</span>
                </h1>
                <p style={{ color: t.textMuted, fontSize: "0.875rem", marginTop: 6 }}>Track all your past and active orders.</p>
            </div>

            {/* Filters */}
            <div style={{ ...card, padding: "16px 24px", marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ color: t.textMuted, fontSize: "0.85rem", fontWeight: 600 }}>Status:</span>
                {["All", "Active", "Pending", "Completed", "Cancelled"].map((filter, i) => (
                    <button key={filter} style={{
                        padding: "6px 14px", fontSize: "0.82rem", borderRadius: t.isMono ? 4 : 6,
                        border: `1px solid ${i === 0 ? `${t.accentPrimary}44` : t.borderPrimary}`,
                        background: i === 0 ? t.accentPrimaryMuted : "transparent",
                        color: i === 0 ? t.accentPrimary : t.textSecondary,
                        cursor: "pointer", fontWeight: 600,
                    }}>{filter}</button>
                ))}
            </div>

            {/* Empty State */}
            <div style={{ ...card, padding: "56px 40px", textAlign: "center" }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <Package style={{ width: 28, height: 28, color: t.accentPrimary }} />
                </div>
                <h3 style={{ fontWeight: 700, marginBottom: 8, fontSize: "1.2rem", color: t.textPrimary }}>No Orders Yet</h3>
                <p style={{ color: t.textMuted, maxWidth: 400, margin: "0 auto 24px", fontSize: "0.875rem" }}>
                    When you purchase a service, your orders will appear here.
                </p>
                <Link href="/services/vps" style={{ display: "inline-block", padding: "10px 24px", borderRadius: t.buttonRadius, background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", textDecoration: "none" }}>
                    Browse Services
                </Link>
            </div>
        </div>
    );
}
