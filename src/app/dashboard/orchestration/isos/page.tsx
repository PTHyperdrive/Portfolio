"use client";

import Link from "next/link";
import { Ban, CheckCircle } from "lucide-react";

function SubNav({ active }: { active: "snapshots" | "backups" | "isos" }) {
    const tabs = [
        { label: "Snapshots", href: "/dashboard/orchestration/snapshots" },
        { label: "Backups",   href: "/dashboard/orchestration/backups"   },
        { label: "ISOs",      href: "/dashboard/orchestration/isos"      },
    ] as const;
    return (
        <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {tabs.map(t => (
                <Link key={t.label} href={t.href} style={{ padding: "8px 18px", borderRadius: "8px 8px 0 0", textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, color: active === t.label.toLowerCase() ? "#f1f5f9" : "#475569", borderBottom: active === t.label.toLowerCase() ? "2px solid #ef4444" : "2px solid transparent", background: active === t.label.toLowerCase() ? "rgba(239,68,68,0.06)" : "transparent", transition: "all 0.15s" }}>
                    {t.label}
                </Link>
            ))}
        </div>
    );
}

export default function IsosPage() {
    const bg   = "#0d1117";
    const card: React.CSSProperties = { background: "#161b22", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 14, padding: "48px 40px", textAlign: "center" };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: bg }}>
            <div style={{ marginBottom: 6 }}>
                <p style={{ fontSize: "0.78rem", color: "#475569" }}>Dashboard&nbsp;•&nbsp;Orchestration</p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f1f5f9", marginTop: 4 }}>Orchestration</h1>
            </div>

            <SubNav active="isos" />

            <div style={card}>
                {/* Blocked icon */}
                <div style={{ width: 88, height: 88, borderRadius: 24, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                </div>

                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: 20 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#ef4444"><circle cx="12" cy="12" r="10" /></svg>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.08em" }}>Feature Disabled</span>
                </div>

                <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#f1f5f9", marginBottom: 12 }}>Custom ISO Upload Blocked</h2>
                <p style={{ fontSize: "0.9rem", color: "#64748b", lineHeight: 1.7, maxWidth: 480, margin: "0 auto 28px" }}>
                    Uploading, mounting, or booting custom ISO images is <strong style={{ color: "#ef4444" }}>strictly prohibited</strong> on this platform
                    to prevent unauthorized OS deployment and maintain infrastructure integrity.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 440, margin: "0 auto 32px", textAlign: "left" }}>
                    {[
                        { icon: "blocked", text: "Custom ISO upload — blocked" },
                        { icon: "blocked", text: "CD/DVD drive mounting (ide2 / cdrom) — blocked" },
                        { icon: "blocked", text: "Boot order override to ISO — blocked" },
                        { icon: "permitted", text: "OS reinstall from approved image library — permitted" },
                    ].map(item => (
                        <div key={item.text} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                            {item.icon === "blocked"
                                ? <Ban style={{ width: 16, height: 16, color: "#ef4444", flexShrink: 0 }} />
                                : <CheckCircle style={{ width: 16, height: 16, color: "#10b981", flexShrink: 0 }} />}
                            <span style={{ fontSize: "0.84rem", color: item.text.includes("permitted") ? "#10b981" : "#475569" }}>{item.text}</span>
                        </div>
                    ))}
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    <Link href="/dashboard/vps" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: 9, textDecoration: "none", background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontWeight: 700, fontSize: "0.875rem" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                        Go to My VMs
                    </Link>
                    <Link href="/dashboard/orchestration/snapshots" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: 9, textDecoration: "none", border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)", color: "#94a3b8", fontWeight: 600, fontSize: "0.875rem" }}>
                        View Snapshots
                    </Link>
                </div>
            </div>
        </div>
    );
}
