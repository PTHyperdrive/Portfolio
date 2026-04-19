"use client";

import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Globe, Info } from "lucide-react";

export default function ProxyDashboard() {
    const t = useThemeTokens();

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>Dashboard &bull; Proxy Accounts</p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>
                    Proxy <span style={{ color: t.accentPrimary }}>Accounts</span>
                </h1>
                <p style={{ color: t.textMuted, fontSize: "0.875rem", marginTop: 6 }}>Manage your active proxy accounts and credentials.</p>
            </div>

            {/* Filters */}
            <div style={{ ...card, padding: "16px 24px", marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ color: t.textMuted, fontSize: "0.85rem", fontWeight: 600 }}>Filter:</span>
                {["All", "HTTP", "SOCKS5", "Residential"].map((filter, i) => (
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
            <div style={{ ...card, padding: "56px 40px", textAlign: "center", marginBottom: 20 }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <Globe style={{ width: 28, height: 28, color: t.accentPrimary }} />
                </div>
                <h3 style={{ fontWeight: 700, marginBottom: 8, fontSize: "1.2rem", color: t.textPrimary }}>No Active Proxies</h3>
                <p style={{ color: t.textMuted, maxWidth: 400, margin: "0 auto 24px", fontSize: "0.875rem" }}>
                    Purchase proxy accounts from our marketplace to manage them here.
                </p>
                <Link href="/services/proxy" style={{ display: "inline-block", padding: "10px 24px", borderRadius: t.buttonRadius, background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", textDecoration: "none" }}>
                    Browse Proxy Plans
                </Link>
            </div>

            {/* Credential Format Info */}
            <div style={{ ...card, padding: "22px 24px" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, color: t.textPrimary }}>
                    <Info style={{ width: 16, height: 16, color: t.accentPrimary }} /> Credential Format
                </h3>
                <div style={{ fontSize: "0.82rem", color: t.textMuted, lineHeight: 1.8, fontFamily: t.fontMono }}>
                    <div style={{ marginBottom: 8 }}>
                        <span style={{ color: t.textSecondary }}>HTTP:</span>{" "}
                        <span style={{ color: t.accentPrimary }}>host:port:username:password</span>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <span style={{ color: t.textSecondary }}>SOCKS5:</span>{" "}
                        <span style={{ color: t.accentSecondary }}>socks5://username:password@host:port</span>
                    </div>
                    <div>
                        <span style={{ color: t.textSecondary }}>Residential:</span>{" "}
                        <span style={{ color: t.statusError }}>{"http://user-zone-{zone}:pass@gate.notrespond.com:7777"}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
