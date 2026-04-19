"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    Zap, CreditCard, KeyRound, MessageSquare, Monitor,
    FileText, BookOpen, HelpCircle, Cloud, ChevronRight,
    AlertTriangle, Clock, Server
} from "lucide-react";

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

export default function OverviewPage() {
    const [data, setData] = useState<OverviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const t = useThemeTokens();

    useEffect(() => {
        fetch("/api/overview")
            .then(r => r.json())
            .then(d => { if (!d.error) setData(d); })
            .finally(() => setLoading(false));
    }, []);

    const card = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    } as React.CSSProperties;

    const statusStyle = (s: string) => ({
        dot: s === "running" ? t.statusSuccess : s === "stopped" ? t.statusError : t.statusWarning,
        label: s === "running" ? "Running" : s === "stopped" ? "Stopped" : "Provisioning",
    });

    if (loading) {
        return (
            <div style={{ padding: "48px 36px", background: t.bgPrimary, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: t.textMuted }}>Loading...</p>
            </div>
        );
    }

    const user = data?.user;
    const vps = data?.vpsInstances ?? [];
    const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

    const QUICK_ACTIONS = [
        { label: "Deploy New Server", href: "/dashboard/billing", Icon: Zap },
        { label: "Add Credit", href: "/dashboard/billing", Icon: CreditCard },
        { label: "SSH Keys", href: "/dashboard/ssh", Icon: KeyRound },
        { label: "Open Ticket", href: "/dashboard/tickets", Icon: MessageSquare },
    ];

    const SUPPORT_LINKS = [
        { label: "Developer Docs", Icon: FileText, href: "#" },
        { label: "How-to Guides", Icon: BookOpen, href: "#" },
        { label: "FAQs", Icon: HelpCircle, href: "#" },
        { label: "NRSP Cloud Features", Icon: Cloud, href: "#" },
    ];

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>

            {/* Breadcrumb */}
            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 24 }}>
                Dashboard &nbsp;&bull;&nbsp; Overview
            </p>

            {/* 2FA Warning Banner */}
            {user && !user.twoFactorEnabled && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 20px", marginBottom: 16, borderRadius: t.isMono ? 4 : 10,
                    background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`,
                    color: t.statusWarning,
                }}>
                    <AlertTriangle style={{ width: 20, height: 20, flexShrink: 0 }} />
                    <p style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
                        NRSP Cloud recommends enabling two-factor authentication to enhance your account security.{" "}
                        <Link href="/dashboard/settings" style={{ color: t.accentPrimary, fontWeight: 700, textDecoration: "underline" }}>
                            Click here
                        </Link>{" "}
                        to set it up now.
                    </p>
                </div>
            )}

            {/* Main Two-Column Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start", width: "100%" }}>

                {/* LEFT COLUMN */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Greeting + Quick Actions */}
                    <div style={{ ...card, padding: 28 }}>
                        <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: t.textPrimary, marginBottom: 6 }}>
                            {getGreeting()}, {firstName}
                        </h2>
                        <p style={{ color: t.textMuted, fontSize: "0.875rem", marginBottom: 24 }}>
                            Here&apos;s a snapshot of your NRSP Cloud workspace.
                        </p>

                        <p style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
                            Quick Actions
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                            {QUICK_ACTIONS.map(a => (
                                <Link key={a.label} href={a.href} style={{
                                    display: "inline-flex", alignItems: "center", gap: 8,
                                    padding: "8px 16px", borderRadius: t.isMono ? 4 : 8, textDecoration: "none",
                                    background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}33`,
                                    color: t.accentPrimary, fontSize: "0.85rem", fontWeight: 600,
                                    transition: "all 0.15s",
                                }}>
                                    <a.Icon style={{ width: 14, height: 14 }} /> {a.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Instances Panel */}
                    <div style={{ ...card, overflow: "hidden" }}>
                        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <Server style={{ width: 18, height: 18, color: t.accentPrimary }} />
                                <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>Your Instances</p>
                            </div>
                            <Link href="/dashboard/vps" style={{ fontSize: "0.8rem", color: t.accentPrimary, textDecoration: "none", fontWeight: 600 }}>
                                View all &rarr;
                            </Link>
                        </div>

                        {vps.length === 0 ? (
                            <div style={{ padding: "56px 24px", textAlign: "center" as const }}>
                                <div style={{ width: 64, height: 64, borderRadius: 16, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                                    <Monitor style={{ width: 28, height: 28, color: t.accentPrimary }} />
                                </div>
                                <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "1rem", marginBottom: 8 }}>No services yet</p>
                                <p style={{ color: t.textMuted, fontSize: "0.875rem", marginBottom: 24 }}>
                                    Deploy your first server to get started with NRSP Cloud
                                </p>
                                <Link href="/dashboard/billing" style={{
                                    display: "inline-flex", alignItems: "center", gap: 8,
                                    padding: "10px 22px", borderRadius: t.buttonRadius, textDecoration: "none",
                                    background: t.accentPrimary, color: t.textInverse, fontSize: "0.875rem", fontWeight: 700,
                                }}>
                                    <Zap style={{ width: 14, height: 14 }} /> Deploy New Server
                                </Link>
                            </div>
                        ) : (
                            <div>
                                {vps.map(vm => {
                                    const ss = statusStyle(vm.status);
                                    return (
                                        <div key={vm.id} style={{ padding: "14px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: ss.dot, flexShrink: 0 }} />
                                                <div>
                                                    <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>{vm.name}</p>
                                                    <p style={{ color: t.textMuted, fontSize: "0.78rem" }}>{vm.os} &middot; {vm.node} &middot; VM {vm.vmId}</p>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: "right" as const }}>
                                                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: ss.dot }}>{ss.label}</span>
                                                {vm.ipAddress && <p style={{ color: t.textMuted, fontSize: "0.75rem", fontFamily: t.fontMono }}>{vm.ipAddress}</p>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Cloud Credit Card */}
                    <div style={{ ...card, padding: 24, textAlign: "center" as const }}>
                        <div style={{ width: 56, height: 56, borderRadius: "50%", background: t.accentPrimaryMuted, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Clock style={{ width: 24, height: 24, color: t.accentPrimary }} />
                        </div>
                        <p style={{ fontWeight: 800, color: t.textPrimary, fontSize: "1rem", marginBottom: 4 }}>
                            {user?.name || user?.email?.split("@")[0]}
                        </p>
                        <p style={{ fontSize: "0.75rem", color: t.textMuted, marginBottom: 20 }}>Cloud Credit</p>
                        <p style={{ fontSize: "2rem", fontWeight: 900, color: t.textPrimary, marginBottom: 20 }}>
                            {(user?.credits ?? 0).toLocaleString()} <span style={{ fontSize: "1rem", color: t.textMuted }}>Credits</span>
                        </p>
                        <Link href="/dashboard/billing/topup" style={{
                            display: "block", padding: "10px 0", borderRadius: t.buttonRadius, textDecoration: "none",
                            background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem",
                            textAlign: "center",
                        }}>
                            Add Credit
                        </Link>
                    </div>

                    {/* Support Links */}
                    <div style={{ ...card, overflow: "hidden" }}>
                        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <HelpCircle style={{ width: 16, height: 16, color: t.statusSuccess }} />
                                <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>Support</p>
                            </div>
                        </div>
                        {SUPPORT_LINKS.map(item => (
                            <Link key={item.label} href={item.href} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "13px 20px", borderBottom: `1px solid ${t.borderSecondary}`,
                                textDecoration: "none", color: t.textSecondary, fontSize: "0.875rem",
                                transition: "background 0.1s",
                            }}
                                onMouseEnter={e => (e.currentTarget.style.background = t.bgCardHover)}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <item.Icon style={{ width: 15, height: 15, color: t.textMuted }} /> {item.label}
                                </span>
                                <ChevronRight style={{ width: 14, height: 14, color: t.textMuted }} />
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
