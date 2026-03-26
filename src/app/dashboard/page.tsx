"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface VpsInstance {
    id: string;
    vmId: string;
    name: string;
    os: string;
    status: string;
    node: string;
    ipAddress: string | null;
}

interface OverviewData {
    user: {
        id: string;
        name: string | null;
        email: string;
        credits: number;
        twoFactorEnabled: boolean;
        activePlan: string | null;
    };
    vpsInstances: VpsInstance[];
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
}

const statusStyle = (s: string) => ({
    dot: s === "running" ? "#10b981" : s === "stopped" ? "#ef4444" : "#f59e0b",
    label: s === "running" ? "Running" : s === "stopped" ? "Stopped" : "Provisioning",
});

export default function OverviewPage() {
    const [data, setData] = useState<OverviewData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/overview")
            .then(r => r.json())
            .then(d => { if (!d.error) setData(d); })
            .finally(() => setLoading(false));
    }, []);

    const bg = "#0d1117";
    const card = { background: "#161b22", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16 } as React.CSSProperties;

    if (loading) {
        return (
            <div style={{ padding: "48px 36px", background: bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: "#475569" }}>Loading…</p>
            </div>
        );
    }

    const user = data?.user;
    const vps = data?.vpsInstances ?? [];
    const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: bg }}>

            {/* Breadcrumb */}
            <p style={{ fontSize: "0.78rem", color: "#475569", marginBottom: 24 }}>
                Dashboard &nbsp;•&nbsp; Overview
            </p>

            {/* ── 2FA Warning Banner ── */}
            {user && !user.twoFactorEnabled && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 20px", marginBottom: 16, borderRadius: 10,
                    background: "rgba(217,119,6,0.15)", border: "1px solid rgba(217,119,6,0.35)",
                    color: "#fbbf24",
                }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <p style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
                        NRSP Cloud recommends enabling two-factor authentication to enhance your account security.{" "}
                        <Link href="/dashboard/settings" style={{ color: "#60a5fa", fontWeight: 700, textDecoration: "underline" }}>
                            Click here
                        </Link>{" "}
                        to set it up now.
                    </p>
                </div>
            )}

            {/* ── Main Two-Column Grid ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>

                {/* ── LEFT COLUMN ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Greeting + Quick Actions */}
                    <div style={{ ...card, padding: 28 }}>
                        <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#f1f5f9", marginBottom: 6 }}>
                            {getGreeting()}, {firstName} 👋
                        </h2>
                        <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: 24 }}>
                            Here&apos;s a snapshot of your NRSP Cloud workspace.
                        </p>

                        <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
                            Quick Actions
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                            {[
                                { label: "Deploy New Server", href: "/dashboard/billing", icon: "⚡" },
                                { label: "Add Credit", href: "/dashboard/billing", icon: "💳" },
                                { label: "SSH Keys", href: "/dashboard/ssh", icon: "🔑" },
                                { label: "Open Ticket", href: "/dashboard/tickets", icon: "📋" },
                            ].map(a => (
                                <Link key={a.label} href={a.href} style={{
                                    display: "inline-flex", alignItems: "center", gap: 8,
                                    padding: "8px 16px", borderRadius: 8, textDecoration: "none",
                                    background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)",
                                    color: "#60a5fa", fontSize: "0.85rem", fontWeight: 600,
                                    transition: "all 0.15s",
                                }}>
                                    <span>{a.icon}</span> {a.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Instances Panel */}
                    <div style={{ ...card, overflow: "hidden" }}>
                        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                                <p style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.95rem" }}>Your Instances</p>
                            </div>
                            <Link href="/dashboard/vps" style={{ fontSize: "0.8rem", color: "#3b82f6", textDecoration: "none", fontWeight: 600 }}>
                                View all →
                            </Link>
                        </div>

                        {vps.length === 0 ? (
                            <div style={{ padding: "56px 24px", textAlign: "center" as const }}>
                                <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🖥️</div>
                                <p style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "1rem", marginBottom: 8 }}>No services yet</p>
                                <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: 24 }}>
                                    Deploy your first server to get started with NRSP Cloud
                                </p>
                                <Link href="/dashboard/billing" style={{
                                    display: "inline-flex", alignItems: "center", gap: 8,
                                    padding: "10px 22px", borderRadius: 8, textDecoration: "none",
                                    background: "#3b82f6", color: "#fff", fontSize: "0.875rem", fontWeight: 700,
                                }}>
                                    ⚡ Deploy New Server
                                </Link>
                            </div>
                        ) : (
                            <div>
                                {vps.map(vm => {
                                    const ss = statusStyle(vm.status);
                                    return (
                                        <div key={vm.id} style={{ padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: ss.dot, flexShrink: 0 }} />
                                                <div>
                                                    <p style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.9rem" }}>{vm.name}</p>
                                                    <p style={{ color: "#64748b", fontSize: "0.78rem" }}>{vm.os} · {vm.node} · VM {vm.vmId}</p>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: "right" as const }}>
                                                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: ss.dot }}>{ss.label}</span>
                                                {vm.ipAddress && <p style={{ color: "#475569", fontSize: "0.75rem", fontFamily: "monospace" }}>{vm.ipAddress}</p>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT COLUMN ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Cloud Credit Card */}
                    <div style={{ ...card, padding: 24, textAlign: "center" as const }}>
                        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(59,130,246,0.15)", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                        </div>
                        <p style={{ fontWeight: 800, color: "#f1f5f9", fontSize: "1rem", marginBottom: 4 }}>
                            {user?.name || user?.email?.split("@")[0]}
                        </p>
                        <p style={{ fontSize: "0.75rem", color: "#475569", marginBottom: 20 }}>Cloud Credit</p>
                        <p style={{ fontSize: "2rem", fontWeight: 900, color: "#f1f5f9", marginBottom: 20 }}>
                            {(user?.credits ?? 0).toLocaleString()} <span style={{ fontSize: "1rem", color: "#475569" }}>₫</span>
                        </p>
                        <Link href="/dashboard/billing" style={{
                            display: "block", padding: "10px 0", borderRadius: 8, textDecoration: "none",
                            background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: "0.875rem",
                        }}>
                            Add Credit
                        </Link>
                    </div>

                    {/* Support Links */}
                    <div style={{ ...card, overflow: "hidden" }}>
                        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></svg>
                                <p style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.9rem" }}>Support</p>
                            </div>
                        </div>
                        {[
                            { label: "Developer Docs", icon: "📄", href: "#" },
                            { label: "How-to Guides", icon: "📖", href: "#" },
                            { label: "FAQs", icon: "❓", href: "#" },
                            { label: "NRSP Cloud Features", icon: "☁️", href: "#" },
                        ].map(item => (
                            <Link key={item.label} href={item.href} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "13px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                                textDecoration: "none", color: "#94a3b8", fontSize: "0.875rem",
                                transition: "background 0.1s",
                            }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span>{item.icon}</span> {item.label}
                                </span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
