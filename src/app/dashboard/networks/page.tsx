"use client";

import { useState } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Globe, Network, Shield, Server, Plus, Wifi, ArrowRightLeft } from "lucide-react";

const SUB_TABS = [
    { id: "vlans", label: "VLANs", Icon: Network },
    { id: "firewall", label: "Firewall Rules", Icon: Shield },
    { id: "dns", label: "DNS Zones", Icon: Globe },
];

export default function NetworksPage() {
    const t = useThemeTokens();
    const [activeTab, setActiveTab] = useState("vlans");

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Dashboard <span>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Networks</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Globe style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Networks</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Manage VLANs, firewall rules, and DNS zones across your Proxmox SDN infrastructure.</p>
                        </div>
                    </div>
                    <button style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: "pointer" }}>
                        <Plus style={{ width: 14, height: 14 }} /> Create Resource
                    </button>
                </div>
            </div>

            {/* Sub-tab Navigation */}
            <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: t.isMono ? 6 : 10, background: t.bgSecondary, border: `1px solid ${t.borderPrimary}`, marginBottom: 24, width: "fit-content" }}>
                {SUB_TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: t.isMono ? 4 : 8, border: "none",
                        background: activeTab === tab.id ? t.accentPrimaryMuted : "transparent",
                        color: activeTab === tab.id ? t.accentPrimary : t.textMuted,
                        fontWeight: activeTab === tab.id ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", transition: "all 0.15s",
                    }}>
                        <tab.Icon style={{ width: 14, height: 14 }} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* Stats Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
                {[
                    { Icon: Network, label: "Total VLANs", value: "0" },
                    { Icon: Shield, label: "Firewall Rules", value: "0" },
                    { Icon: Globe, label: "DNS Zones", value: "0" },
                    { Icon: ArrowRightLeft, label: "Active Routes", value: "0" },
                ].map(stat => (
                    <div key={stat.label} style={{ ...card, padding: "18px 22px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <stat.Icon style={{ width: 14, height: 14, color: t.textMuted }} />
                            <span style={{ fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</span>
                        </div>
                        <p style={{ fontSize: "1.6rem", fontWeight: 800, color: t.accentPrimary }}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Content Area */}
            <div style={card}>
                <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>
                        {SUB_TABS.find(t => t.id === activeTab)?.label}
                    </span>
                </div>

                {/* Empty State */}
                <div style={{ padding: "56px 24px", textAlign: "center" }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                        {activeTab === "vlans" && <Network style={{ width: 28, height: 28, color: t.accentPrimary }} />}
                        {activeTab === "firewall" && <Shield style={{ width: 28, height: 28, color: t.accentPrimary }} />}
                        {activeTab === "dns" && <Globe style={{ width: 28, height: 28, color: t.accentPrimary }} />}
                    </div>
                    <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "1rem", marginBottom: 6 }}>
                        No {activeTab === "vlans" ? "VLANs" : activeTab === "firewall" ? "firewall rules" : "DNS zones"} configured
                    </p>
                    <p style={{ color: t.textMuted, fontSize: "0.875rem", maxWidth: 400, margin: "0 auto 24px" }}>
                        {activeTab === "vlans" && "Create a VLAN to isolate traffic between your virtual machines on the Proxmox SDN."}
                        {activeTab === "firewall" && "Add firewall rules to control inbound and outbound traffic for your networks."}
                        {activeTab === "dns" && "Configure DNS zones for your internal and external domain resolution."}
                    </p>
                    <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: "pointer" }}>
                        <Plus style={{ width: 14, height: 14 }} />
                        Create {activeTab === "vlans" ? "VLAN" : activeTab === "firewall" ? "Rule" : "Zone"}
                    </button>
                </div>
            </div>
        </div>
    );
}
