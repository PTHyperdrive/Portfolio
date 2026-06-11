"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    Shield, DollarSign, Users, Package, Ticket, Store,
    Settings, ChevronRight, AlertTriangle, RefreshCw,
    Server, Activity, MessageSquare, MessagesSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface PlatformStats {
    totalUsers: number;
    totalRevenue: number;
    activeOrders: number;
    activeVMs: number;
    openTickets: number;
    activeChats: number;
}

const ADMIN_SECTIONS: { title: string; description: string; href: string; Icon: LucideIcon }[] = [
    { title: "Server Management",  description: "All virtual machines across all users",        href: "/adminsystemnrsp/servers",    Icon: Server         },
    { title: "User Accounts",      description: "View and manage all registered users",         href: "/adminsystemnrsp/accounts",   Icon: Users          },
    { title: "Pricing",             description: "Manage platform tier pricing and credit rates", href: "/adminsystemnrsp/pricing",    Icon: DollarSign      },
    { title: "Billing & Invoices", description: "Global transaction log across all users",      href: "/adminsystemnrsp/billing",    Icon: Package        },
    { title: "Audit Logs",         description: "Immutable record of all platform actions",     href: "/adminsystemnrsp/audit-logs", Icon: Activity       },
    { title: "Tickets",            description: "Review and resolve user support tickets",      href: "/adminsystemnrsp/tickets",    Icon: MessageSquare  },
    { title: "Secure Chat",        description: "E2EE chat threads with users",                 href: "/adminsystemnrsp/chats",      Icon: MessagesSquare },
    { title: "MMO Admin",          description: "Manage digital storefront categories and stock",href: "/adminsystemnrsp/mmo",       Icon: Store          },
    { title: "System Settings",    description: "Platform config, maintenance, credit rates",   href: "/adminsystemnrsp/settings",   Icon: Settings       },
];

export default function AdminDashboardPage() {
    const t = useThemeTokens();
    const [stats, setStats] = useState<PlatformStats>({
        totalUsers: 0, totalRevenue: 0, activeOrders: 0,
        activeVMs: 0, openTickets: 0, activeChats: 0,
    });
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

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };

    const STAT_CARDS: { title: string; value: string; Icon: LucideIcon; color: string }[] = [
        { title: "Total Revenue", value: `${stats.totalRevenue.toLocaleString()} VND`, Icon: DollarSign, color: t.statusSuccess },
        { title: "Total Users", value: stats.totalUsers.toLocaleString(), Icon: Users, color: t.accentPrimary },
        { title: "Active Orders", value: stats.activeOrders.toLocaleString(), Icon: Package, color: t.statusWarning },
        { title: "Active VMs", value: stats.activeVMs.toLocaleString(), Icon: Server, color: t.accentSecondary },
        { title: "Open Tickets", value: stats.openTickets.toLocaleString(), Icon: Ticket, color: t.statusError },
        { title: "Active Chats", value: stats.activeChats.toLocaleString(), Icon: MessagesSquare, color: t.statusSuccess },
    ];

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Admin System <span>&bull;</span>
                    <span style={{ color: t.statusWarning, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.statusWarningBg }}>Dashboard</span>
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
                    <button onClick={() => loadStats()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: t.isMono ? 0 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                        <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                    </button>
                </div>
            </div>

            {/* Role Warning */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderRadius: t.isMono ? 0 : 8, background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`, color: t.statusWarning, fontSize: "0.83rem", marginBottom: 24 }}>
                <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span>You are operating in administrator mode. All actions are logged in the audit trail.</span>
            </div>

            {/* Stats Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14, marginBottom: 28 }}>
                {STAT_CARDS.map(stat => (
                    <div key={stat.title} style={{ ...card, padding: "20px 22px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${stat.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <stat.Icon style={{ width: 17, height: 17, color: stat.color }} />
                            </div>
                            {loading && <Activity style={{ width: 12, height: 12, color: t.textMuted }} />}
                        </div>
                        <p style={{ fontSize: "0.68rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{stat.title}</p>
                        <p style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>{stat.value}</p>
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
