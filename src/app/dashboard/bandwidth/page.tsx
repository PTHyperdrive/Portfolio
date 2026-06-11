"use client";

import { useState } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { BarChart2, ArrowUpDown, ArrowDown, ArrowUp, Calendar, Server, Globe } from "lucide-react";

const TIME_RANGES = ["24h", "7d", "30d", "90d"] as const;

export default function BandwidthPage() {
    const t = useThemeTokens();
    const [range, setRange] = useState<typeof TIME_RANGES[number]>("30d");

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Dashboard <span>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Bandwidth Usage</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <BarChart2 style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Bandwidth Usage</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Monitor network traffic across all your virtual machines and services.</p>
                        </div>
                    </div>
                    {/* Time range selector */}
                    <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: t.isMono ? 0 : 10, background: t.bgSecondary, border: `1px solid ${t.borderPrimary}` }}>
                        {TIME_RANGES.map(r => (
                            <button key={r} onClick={() => setRange(r)} style={{
                                padding: "6px 14px", borderRadius: t.isMono ? 0 : 7, border: "none",
                                background: range === r ? t.accentPrimaryMuted : "transparent",
                                color: range === r ? t.accentPrimary : t.textMuted,
                                fontWeight: range === r ? 700 : 500, fontSize: "0.8rem", cursor: "pointer", transition: "all 0.15s",
                            }}>{r}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Summary Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
                {[
                    { Icon: ArrowUpDown, label: "Total Transfer", value: "0 B", sub: `Last ${range}` },
                    { Icon: ArrowUp, label: "Outbound (TX)", value: "0 B", sub: "Egress" },
                    { Icon: ArrowDown, label: "Inbound (RX)", value: "0 B", sub: "Ingress" },
                    { Icon: Server, label: "Active Interfaces", value: "0", sub: "vNICs" },
                ].map(stat => (
                    <div key={stat.label} style={{ ...card, padding: "20px 22px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <stat.Icon style={{ width: 14, height: 14, color: t.textMuted }} />
                            <span style={{ fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</span>
                        </div>
                        <p style={{ fontSize: "1.6rem", fontWeight: 800, color: t.accentPrimary, lineHeight: 1 }}>{stat.value}</p>
                        <p style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 4 }}>{stat.sub}</p>
                    </div>
                ))}
            </div>

            {/* Chart Placeholder */}
            <div style={{ ...card, marginBottom: 24 }}>
                <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 10 }}>
                    <BarChart2 style={{ width: 16, height: 16, color: t.accentPrimary }} />
                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>Traffic Over Time</span>
                </div>
                <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
                    {/* Placeholder grid lines */}
                    {[0, 1, 2, 3, 4].map(i => (
                        <div key={i} style={{ position: "absolute", left: 60, right: 20, top: `${20 + i * 50}px`, height: 1, background: t.borderSecondary }} />
                    ))}
                    <div style={{ textAlign: "center", zIndex: 1 }}>
                        <BarChart2 style={{ width: 40, height: 40, color: t.textMuted, marginBottom: 12 }} />
                        <p style={{ color: t.textMuted, fontSize: "0.875rem" }}>No traffic data available for the selected period.</p>
                        <p style={{ color: t.textMuted, fontSize: "0.78rem", marginTop: 4 }}>Deploy a VM to start tracking bandwidth usage.</p>
                    </div>
                </div>
            </div>

            {/* Per-VM Breakdown — Empty */}
            <div style={card}>
                <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 10 }}>
                    <Globe style={{ width: 16, height: 16, color: t.accentPrimary }} />
                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>Per-Instance Breakdown</span>
                </div>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px 100px", gap: 12, padding: "10px 24px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                    {["Instance", "Inbound", "Outbound", "Total", "Status"].map(h => (
                        <span key={h} style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                    ))}
                </div>
                <div style={{ padding: "40px 24px", textAlign: "center" }}>
                    <p style={{ color: t.textMuted, fontSize: "0.875rem" }}>No instances with bandwidth data.</p>
                </div>
            </div>
        </div>
    );
}
