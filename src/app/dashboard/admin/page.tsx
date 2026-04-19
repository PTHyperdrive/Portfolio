"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    Shield, DollarSign, Users, Package, Monitor,
    Wrench, ClipboardList, PenSquare, Globe, Lock,
    Settings, ChevronRight, AlertTriangle, RefreshCw,
    Server, Activity
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface PlatformStats {
    totalUsers: number;
    totalRevenue: number;
    activeOrders: number;
    activeVMs: number;
}

const ADMIN_SECTIONS: { title: string; description: string; href: string; Icon: LucideIcon }[] = [
    { title: "Pricing Management", description: "Edit VPS tier pricing and GPU rates", href: "/admin/pricing", Icon: DollarSign },
    { title: "Account Management", description: "View user accounts and VPS instances", href: "/admin/accounts", Icon: Users },
    { title: "Service Management", description: "Add, edit, or remove service listings", href: "/admin/services", Icon: Wrench },
    { title: "Order Management", description: "Process orders and update statuses", href: "/admin/orders", Icon: ClipboardList },
    { title: "Blog Management", description: "Create, edit, and publish blog posts", href: "/admin/blog", Icon: PenSquare },
    { title: "Proxy Inventory", description: "Manage proxy stock and locations", href: "/admin/proxy", Icon: Globe },
    { title: "VPN Servers", description: "Configure VPN server endpoints", href: "/admin/vpn", Icon: Lock },
    { title: "System Settings", description: "Configure system parameters and flags", href: "/admin/settings", Icon: Settings },
];

export default function DashboardAdminPage() {
    const t = useThemeTokens();
    const [stats, setStats] = useState<PlatformStats>({ totalUsers: 0, totalRevenue: 0, activeOrders: 0, activeVMs: 0 });
    const [loading, setLoading] = useState(true);

    const loadStats = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/stats");
            if (res.ok) { const data = await res.json(); setStats(data); }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadStats(); }, [loadStats]);

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    const STAT_CARDS: { title: string; value: string; Icon: LucideIcon; color: string }[] = [
        { title: "Total Revenue", value: `$${stats.totalRevenue.toFixed(2)}`, Icon: DollarSign, color: t.statusSuccess },
        { title: "Total Users", value: stats.totalUsers.toLocaleString(), Icon: Users, color: t.accentPrimary },
        { title: "Active Orders", value: stats.activeOrders.toLocaleString(), Icon: Package, color: t.statusWarning },
        { title: "Active VMs", value: stats.activeVMs.toLocaleString(), Icon: Monitor, color: t.accentSecondary },
    ];

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Dashboard <span>&bull;</span>
                    <span style={{ color: t.statusWarning, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.statusWarningBg }}>Admin Panel</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Shield style={{ width: 22, height: 22, color: t.statusWarning }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Admin Panel</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Platform management, users, billing, and infrastructure oversight.</p>
                        </div>
                    </div>
                    <button onClick={() => loadStats()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                        <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                    </button>
                </div>
            </div>

            {/* Role Warning */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderRadius: t.isMono ? 4 : 8, background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`, color: t.statusWarning, fontSize: "0.83rem", marginBottom: 24 }}>
                <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span>You are operating in administrator mode. All actions are logged in the audit trail.</span>
            </div>

            {/* Stats Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
                {STAT_CARDS.map(stat => (
                    <div key={stat.title} style={{ ...card, padding: "22px 24px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${stat.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <stat.Icon style={{ width: 18, height: 18, color: stat.color }} />
                            </div>
                            {loading && <Activity style={{ width: 14, height: 14, color: t.textMuted }} />}
                        </div>
                        <p style={{ fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{stat.title}</p>
                        <p style={{ fontSize: "1.8rem", fontWeight: 800, color: t.textPrimary }}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Quick Access Grid */}
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: t.textSecondary, marginBottom: 14 }}>Management</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                {ADMIN_SECTIONS.map(section => (
                    <Link key={section.title} href={section.href} style={{ ...card, padding: "22px 24px", textDecoration: "none", display: "block", transition: "border-color 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = `${t.accentPrimary}55`)}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = t.borderPrimary)}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <section.Icon style={{ width: 18, height: 18, color: t.accentPrimary }} />
                            </div>
                            <ChevronRight style={{ width: 14, height: 14, color: t.textMuted }} />
                        </div>
                        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>{section.title}</h3>
                        <p style={{ fontSize: "0.82rem", color: t.textMuted, lineHeight: 1.5 }}>{section.description}</p>
                    </Link>
                ))}
            </div>

            {/* System Health */}
            <div style={{ ...card, marginTop: 24 }}>
                <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 10 }}>
                    <Server style={{ width: 16, height: 16, color: t.accentPrimary }} />
                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>Infrastructure Health</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
                    {[
                        { label: "Proxmox Cluster", status: "Healthy", color: t.statusSuccess },
                        { label: "TrueNAS Storage", status: "Healthy", color: t.statusSuccess },
                        { label: "Network Gateway", status: "Healthy", color: t.statusSuccess },
                    ].map((svc, i) => (
                        <div key={svc.label} style={{ padding: "18px 24px", borderRight: i < 2 ? `1px solid ${t.borderSecondary}` : "none" }}>
                            <p style={{ fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{svc.label}</p>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: svc.color }} />
                                <span style={{ fontSize: "0.875rem", fontWeight: 700, color: svc.color }}>{svc.status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
