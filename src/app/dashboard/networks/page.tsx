"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    Globe, Network, Shield, Server, Layers, ChevronRight,
    RefreshCw, ExternalLink,
} from "lucide-react";

/* ─── Types ─── */

interface VpcInfo {
    id: string;
    name: string;
    vlanId: number;
    subnet: string;
    gateway: string;
    status: string;
}

interface VpsInfo {
    id: string;
    vmId: string;
    name: string;
    status: string;
    node: string;
}

interface VpcAssignment {
    id: string;
    bridgeName: string;
    ipAddress: string | null;
    assignedAt: string;
    vpc: VpcInfo;
    vpsInstance: VpsInfo;
}

type TabId = "vpc" | "firewall" | "dns";

/* ─── Component ─── */

export default function NetworksPage() {
    const t = useThemeTokens();
    const [activeTab, setActiveTab] = useState<TabId>("vpc");
    const [assignments, setAssignments] = useState<VpcAssignment[]>([]);
    const [loading, setLoading] = useState(true);

    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/networks");
            if (res.ok) {
                const data = await res.json();
                setAssignments(data.assignments ?? []);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Unique VPCs from assignments
    const uniqueVpcs = Array.from(
        new Map(assignments.map(a => [a.vpc.id, a.vpc])).values()
    );

    const tabs: { id: TabId; label: string; icon: React.ElementType; count?: number }[] = [
        { id: "vpc", label: "VPC Networks", icon: Network, count: uniqueVpcs.length },
        { id: "firewall", label: "Firewall Rules", icon: Shield },
        { id: "dns", label: "DNS Zones", icon: Globe },
    ];

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>
                    Dashboard <span>&bull;</span> Networking
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Globe style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>Networks</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>VPC assignments, firewall, and DNS for your resources.</p>
                        </div>
                    </div>
                    <button
                        id="networks-refresh"
                        onClick={loadData}
                        style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                            borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`,
                            background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer",
                            transition: "all 150ms",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = t.accentPrimary; e.currentTarget.style.color = t.accentPrimary; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = t.borderPrimary; e.currentTarget.style.color = t.textMuted; }}
                    >
                        <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                {[
                    { label: "VPCs", val: uniqueVpcs.length, color: t.accentPrimary },
                    { label: "Assigned VMs", val: assignments.length, color: t.statusSuccess },
                    { label: "Active VPCs", val: uniqueVpcs.filter(v => v.status === "ACTIVE").length, color: t.statusWarning },
                ].map(chip => (
                    <div key={chip.label} style={{
                        padding: "8px 18px", borderRadius: t.isMono ? 4 : 8,
                        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
                        display: "flex", alignItems: "center", gap: 8,
                    }}>
                        <span style={{ fontSize: "0.72rem", color: t.textMuted, fontWeight: 600 }}>{chip.label}</span>
                        <span style={{ fontSize: "1rem", fontWeight: 800, color: chip.color, fontFamily: t.fontMono }}>{chip.val}</span>
                    </div>
                ))}
            </div>

            {/* Tab Navigation */}
            <div style={{
                display: "flex", gap: 2, marginBottom: 20,
                background: t.bgSecondary, borderRadius: t.isMono ? 4 : 10,
                padding: 3, width: "fit-content",
            }}>
                {tabs.map(tab => {
                    const active = activeTab === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            id={`networks-tab-${tab.id}`}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "8px 16px",
                                borderRadius: t.isMono ? 3 : 8,
                                border: "none",
                                background: active ? t.bgCard : "transparent",
                                color: active ? t.accentPrimary : t.textMuted,
                                fontWeight: active ? 700 : 500,
                                fontSize: "0.82rem",
                                cursor: "pointer",
                                transition: "all 150ms",
                                boxShadow: active ? t.shadow : "none",
                            }}
                        >
                            <Icon style={{ width: 14, height: 14 }} />
                            {tab.label}
                            {tab.count !== undefined && (
                                <span style={{
                                    fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px",
                                    borderRadius: 10,
                                    background: active ? t.accentPrimaryMuted : t.borderPrimary,
                                    color: active ? t.accentPrimary : t.textMuted,
                                }}>{tab.count}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {activeTab === "vpc" && (
                <div style={card}>
                    {loading ? (
                        <div style={{ padding: "48px 24px", textAlign: "center", color: t.textMuted, fontSize: "0.88rem" }}>
                            Loading VPC assignments...
                        </div>
                    ) : assignments.length === 0 ? (
                        <div style={{ padding: "64px 24px", textAlign: "center" }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: 16,
                                background: t.accentPrimaryMuted,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                margin: "0 auto 16px",
                            }}>
                                <Layers style={{ width: 28, height: 28, color: t.accentPrimary }} />
                            </div>
                            <p style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>
                                No VPC Assignments
                            </p>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted, maxWidth: 380, margin: "0 auto" }}>
                                Your virtual machines are not assigned to any VPC network yet. Contact an administrator for VPC provisioning.
                            </p>
                        </div>
                    ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ background: t.bgSecondary }}>
                                    {["VPC", "VLAN", "Subnet", "Gateway", "Assigned IP", "VM", "Status"].map(h => (
                                        <th key={h} style={{
                                            padding: "10px 16px", textAlign: "left", fontSize: "0.68rem",
                                            fontWeight: 700, color: t.textMuted, textTransform: "uppercase",
                                            letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}`,
                                            whiteSpace: "nowrap",
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {assignments.map((a, idx) => (
                                    <tr
                                        key={a.id}
                                        style={{ borderBottom: idx < assignments.length - 1 ? `1px solid ${t.borderSecondary}` : "none" }}
                                        onMouseEnter={e => (e.currentTarget.style.background = t.bgCardHover)}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                    >
                                        <td style={{ padding: "12px 16px" }}>
                                            <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.875rem" }}>
                                                {a.vpc.name}
                                            </span>
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <span style={{
                                                fontSize: "0.75rem", fontWeight: 700, padding: "3px 8px",
                                                borderRadius: 4, background: t.accentPrimaryMuted,
                                                color: t.accentPrimary, fontFamily: t.fontMono,
                                            }}>
                                                {a.vpc.vlanId}
                                            </span>
                                        </td>
                                        <td style={{ padding: "12px 16px", fontFamily: t.fontMono, fontSize: "0.82rem", color: t.textSecondary }}>
                                            {a.vpc.subnet}
                                        </td>
                                        <td style={{ padding: "12px 16px", fontFamily: t.fontMono, fontSize: "0.82rem", color: t.textMuted }}>
                                            {a.vpc.gateway}
                                        </td>
                                        <td style={{ padding: "12px 16px", fontFamily: t.fontMono, fontSize: "0.82rem", color: t.accentPrimary }}>
                                            {a.ipAddress || "DHCP"}
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <Server style={{ width: 13, height: 13, color: t.textMuted }} />
                                                <span style={{ fontSize: "0.82rem", color: t.textPrimary, fontWeight: 600 }}>
                                                    {a.vpsInstance.name}
                                                </span>
                                                <span style={{ fontSize: "0.68rem", color: t.textMuted, fontFamily: t.fontMono }}>
                                                    #{a.vpsInstance.vmId}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <span style={{
                                                display: "inline-flex", alignItems: "center", gap: 4,
                                                fontSize: "0.72rem", fontWeight: 700, padding: "3px 8px",
                                                borderRadius: 4,
                                                background: a.vpc.status === "ACTIVE" ? t.statusSuccessBg : t.statusErrorBg,
                                                color: a.vpc.status === "ACTIVE" ? t.statusSuccess : t.statusError,
                                            }}>
                                                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                                                {a.vpc.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {activeTab === "firewall" && (
                <div style={{ ...card, padding: "64px 24px", textAlign: "center" }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 16,
                        background: t.statusWarningBg,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        margin: "0 auto 16px",
                    }}>
                        <Shield style={{ width: 28, height: 28, color: t.statusWarning }} />
                    </div>
                    <p style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>
                        Firewall Rules
                    </p>
                    <p style={{ fontSize: "0.83rem", color: t.textMuted, maxWidth: 380, margin: "0 auto" }}>
                        Firewall rule management is available in the admin Infrastructure panel. VPC isolation rules are auto-provisioned during VPC creation.
                    </p>
                </div>
            )}

            {activeTab === "dns" && (
                <div style={{ ...card, padding: "64px 24px", textAlign: "center" }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 16,
                        background: t.accentPrimaryMuted,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        margin: "0 auto 16px",
                    }}>
                        <Globe style={{ width: 28, height: 28, color: t.accentPrimary }} />
                    </div>
                    <p style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>
                        DNS Zones
                    </p>
                    <p style={{ fontSize: "0.83rem", color: t.textMuted, maxWidth: 380, margin: "0 auto" }}>
                        DNS zone management will be available in a future update. Internal DNS resolution is handled automatically within each VPC.
                    </p>
                </div>
            )}
        </div>
    );
}
