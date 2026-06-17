"use client";

import { useThemeTokens } from "@/lib/useThemeTokens";
import { Sliders, Cpu, MemoryStick, HardDrive, Globe, Server, AlertTriangle } from "lucide-react";

interface Quota {
    label: string;
    Icon: typeof Cpu;
    used: number;
    max: number;
    unit: string;
    color: string;
}

export default function ResourceLimitsPage() {
    const t = useThemeTokens();

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    const quotas: Quota[] = [
        { label: "vCPU Cores", Icon: Cpu, used: 0, max: 32, unit: "cores", color: t.accentPrimary },
        { label: "RAM", Icon: MemoryStick, used: 0, max: 64, unit: "GB", color: "#81c995" },
        { label: "NVMe Storage", Icon: HardDrive, used: 0, max: 2000, unit: "GB", color: "#f28b82" },
        { label: "Public IPs", Icon: Globe, used: 0, max: 5, unit: "addresses", color: "#fdd663" },
        { label: "Virtual Machines", Icon: Server, used: 0, max: 10, unit: "instances", color: "#8ab4f8" },
        { label: "Snapshots", Icon: HardDrive, used: 0, max: 50, unit: "snapshots", color: "#c58af9" },
    ];

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Dashboard <span>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Resource Limits</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Sliders style={{ width: 22, height: 22, color: t.accentPrimary }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Resource Limits</h1>
                        <p style={{ fontSize: "0.83rem", color: t.textMuted }}>View your current resource quotas and usage across vCPU, RAM, storage, and networking.</p>
                    </div>
                </div>
            </div>

            {/* Quota Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
                {quotas.map(q => {
                    const pct = q.max > 0 ? Math.round((q.used / q.max) * 100) : 0;
                    return (
                        <div key={q.label} style={{ ...card, padding: "22px 26px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 9, background: `${q.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <q.Icon style={{ width: 18, height: 18, color: q.color }} />
                                    </div>
                                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>{q.label}</span>
                                </div>
                                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: t.textMuted }}>{pct}%</span>
                            </div>
                            {/* Progress bar */}
                            <div style={{ height: 8, borderRadius: 4, background: t.borderPrimary, overflow: "hidden", marginBottom: 10 }}>
                                <div style={{ height: "100%", borderRadius: 4, background: q.color, width: `${pct}%`, transition: "width 0.5s", minWidth: pct > 0 ? 4 : 0 }} />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "0.78rem", color: t.textMuted }}>{q.used} {q.unit} used</span>
                                <span style={{ fontSize: "0.78rem", color: t.textMuted }}>{q.max} {q.unit} max</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Quota Increase Notice */}
            <div style={{ ...card, padding: "20px 24px", display: "flex", alignItems: "center", gap: 14 }}>
                <AlertTriangle style={{ width: 18, height: 18, color: t.statusWarning, flexShrink: 0 }} />
                <div>
                    <p style={{ fontSize: "0.9rem", fontWeight: 700, color: t.textPrimary, marginBottom: 2 }}>Need higher limits?</p>
                    <p style={{ fontSize: "0.83rem", color: t.textMuted }}>
                        Contact support or submit a ticket to request a quota increase. Enterprise plans include higher default allocations.
                    </p>
                </div>
            </div>
        </div>
    );
}
