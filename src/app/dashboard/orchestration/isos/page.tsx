"use client";

import Link from "next/link";
import { Ban, CheckCircle, Server, Circle, AlertOctagon } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";

function SubNav({ active }: { active: "snapshots" | "backups" | "isos" }) {
    const t = useThemeTokens();
    const tabs = [
        { label: "Snapshots", href: "/dashboard/orchestration/snapshots" },
        { label: "Backups",   href: "/dashboard/orchestration/backups"   },
        { label: "ISOs",      href: "/dashboard/orchestration/isos"      },
    ] as const;
    return (
        <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${t.borderPrimary}` }}>
            {tabs.map(tab => {
                const on = active === tab.label.toLowerCase();
                return (
                    <Link key={tab.label} href={tab.href} style={{ padding: "8px 18px", borderRadius: `${t.buttonRadius}px ${t.buttonRadius}px 0 0`, textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, color: on ? t.accentPrimary : t.textMuted, borderBottom: on ? `2px solid ${t.accentPrimary}` : "2px solid transparent", background: on ? t.accentPrimaryMuted : "transparent", transition: "all 0.15s" }}>
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}

export default function IsosPage() {
    const t = useThemeTokens();
    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.statusError}33`, borderRadius: t.cardRadius, boxShadow: t.shadow, padding: "48px 40px", textAlign: "center" };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <div style={{ marginBottom: 6 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted }}>Dashboard&nbsp;•&nbsp;Orchestration</p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary, marginTop: 4 }}>Orchestration</h1>
            </div>

            <SubNav active="isos" />

            <div style={card}>
                {/* Blocked icon */}
                <div style={{ width: 88, height: 88, borderRadius: 24, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                    <AlertOctagon style={{ width: 40, height: 40, color: t.statusError }} strokeWidth={1.5} />
                </div>

                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: t.statusErrorBg, border: `1px solid ${t.statusError}44`, marginBottom: 20 }}>
                    <Circle style={{ width: 10, height: 10, fill: t.statusError, color: t.statusError }} />
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: t.statusError, textTransform: "uppercase", letterSpacing: "0.08em" }}>Feature Disabled</span>
                </div>

                <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: t.textPrimary, marginBottom: 12 }}>Custom ISO Upload Blocked</h2>
                <p style={{ fontSize: "0.9rem", color: t.textSecondary, lineHeight: 1.7, maxWidth: 480, margin: "0 auto 28px" }}>
                    Uploading, mounting, or booting custom ISO images is <strong style={{ color: t.statusError }}>strictly prohibited</strong> on this platform
                    to prevent unauthorized OS deployment and maintain infrastructure integrity.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 440, margin: "0 auto 32px", textAlign: "left" }}>
                    {[
                        { icon: "blocked", text: "Custom ISO upload — blocked" },
                        { icon: "blocked", text: "CD/DVD drive mounting (ide2 / cdrom) — blocked" },
                        { icon: "blocked", text: "Boot order override to ISO — blocked" },
                        { icon: "permitted", text: "OS reinstall from approved image library — permitted" },
                    ].map(item => (
                        <div key={item.text} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: t.buttonRadius, background: t.bgInput, border: `1px solid ${t.borderSecondary}` }}>
                            {item.icon === "blocked"
                                ? <Ban style={{ width: 16, height: 16, color: t.statusError, flexShrink: 0 }} />
                                : <CheckCircle style={{ width: 16, height: 16, color: t.statusSuccess, flexShrink: 0 }} />}
                            <span style={{ fontSize: "0.84rem", color: item.text.includes("permitted") ? t.statusSuccess : t.textSecondary }}>{item.text}</span>
                        </div>
                    ))}
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    <Link href="/dashboard/vps" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: t.buttonRadius, textDecoration: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem" }}>
                        <Server style={{ width: 14, height: 14 }} />
                        Go to My VMs
                    </Link>
                    <Link href="/dashboard/orchestration/snapshots" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: t.buttonRadius, textDecoration: "none", border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 600, fontSize: "0.875rem" }}>
                        View Snapshots
                    </Link>
                </div>
            </div>
        </div>
    );
}
