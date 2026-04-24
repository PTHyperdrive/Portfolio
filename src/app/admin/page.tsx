"use client";

import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    DollarSign, Users, Package, Monitor,
    Wrench, ClipboardList, PenSquare, Globe, Lock, Settings
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ADMIN_STATS: { title: string; value: string; Icon: LucideIcon; color: string; change: string }[] = [
    { title: "Total Revenue", value: "$0.00", Icon: DollarSign, color: "var(--accent-green)", change: "+0%" },
    { title: "Total Users", value: "0", Icon: Users, color: "var(--accent-cyan)", change: "+0" },
    { title: "Active Orders", value: "0", Icon: Package, color: "var(--accent-purple)", change: "+0" },
    { title: "Active Services", value: "0", Icon: Monitor, color: "var(--accent-magenta)", change: "+0" },
];

const ADMIN_LINKS: { title: string; description: string; href: string; Icon: LucideIcon }[] = [
    { title: "Pricing Management", description: "Edit VPS tier pricing and GPU rates", href: "/admin/pricing", Icon: DollarSign },
    { title: "Account Management", description: "View user accounts and their VPS instances", href: "/admin/accounts", Icon: Users },
    { title: "Service Management", description: "Add, edit, or remove service listings", href: "/admin/services", Icon: Wrench },
    { title: "Order Management", description: "Process orders and update statuses", href: "/admin/orders", Icon: ClipboardList },
    { title: "Blog Management", description: "Create, edit, and publish blog posts", href: "/admin/blog", Icon: PenSquare },
    { title: "MMO Inventory", description: "Manage MMO digital asset stock and categories", href: "/admin/mmo", Icon: Globe },
    { title: "VPN Servers", description: "Configure VPN server endpoints", href: "/admin/vpn", Icon: Lock },
    { title: "System Settings", description: "Configure system parameters", href: "/admin/settings", Icon: Settings },
];

export default function AdminPage() {
    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container">
                {/* Header */}
                <div style={{ marginBottom: "40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "4px" }}>
                            Admin <span className="gradient-text">Panel</span>
                        </h1>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                            Manage your platform, users, and services.
                        </p>
                    </div>
                    <span className="badge badge-magenta">ADMIN ACCESS</span>
                </div>

                {/* Stats */}
                <div className="grid-4 stagger" style={{ marginBottom: "40px" }}>
                    {ADMIN_STATS.map((stat) => (
                        <div key={stat.title} className="glass-card" style={{ padding: "24px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--glass-bg)", border: "1px solid var(--glass-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <stat.Icon style={{ width: 18, height: 18, color: stat.color }} />
                                </div>
                                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: stat.color }}>{stat.change}</span>
                            </div>
                            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: "4px" }}>
                                {stat.title}
                            </p>
                            <p style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--text-primary)" }}>
                                {stat.value}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Admin Links */}
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "16px", color: "var(--text-secondary)" }}>Management</h2>
                <div className="grid-4 stagger">
                    {ADMIN_LINKS.map((link) => (
                        <Link key={link.title} href={link.href} className="glass-card" style={{ padding: "24px", textDecoration: "none", display: "block" }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--glass-bg)", border: "1px solid var(--glass-border)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                                <link.Icon style={{ width: 18, height: 18, color: "var(--accent-cyan)" }} />
                            </div>
                            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>
                                {link.title}
                            </h3>
                            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                                {link.description}
                            </p>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
