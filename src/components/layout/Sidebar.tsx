"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
    LayoutGrid, Server, Gamepad2, Cloud, Key, Globe, Settings as SettingsIcon,
    Users, History, BarChart2, Wallet, User, Sliders, MessageSquare,
    ChevronDown, ChevronRight, LogOut, Shield
} from "lucide-react";

type SubItem = { label: string; href: string };
type NavItem = {
    label: string;
    icon: React.ElementType;
    href: string;
    subItems?: SubItem[];
    hasArrow?: boolean;
};
type NavGroup = { title: string; items: NavItem[] };

const SIDEBAR_STRUCTURE: NavGroup[] = [
    {
        title: "PUBLIC CLOUD",
        items: [
            {
                label: "Compute", icon: Server, href: "/dashboard/vps",
                subItems: [
                    { label: "Virtual Machine", href: "/dashboard/vps" },
                    { label: "Bare Metal", href: "/dashboard/metal" },
                ]
            },
            { label: "Game Hosting", icon: Gamepad2, href: "/dashboard/game" },
            { label: "Storage", icon: Cloud, href: "/dashboard/storage", hasArrow: true },
            { label: "SSH Keys", icon: Key, href: "/dashboard/ssh" },
            { label: "Networks", icon: Globe, href: "/dashboard/networks", hasArrow: true },
            { label: "Orchestration", icon: SettingsIcon, href: "/dashboard/orchestration", hasArrow: true },
        ],
    },
    {
        title: "TEAM",
        items: [
            { label: "Team Management", icon: Users, href: "/dashboard/team" },
            { label: "Activity Log", icon: History, href: "/dashboard/activity" },
            { label: "Bandwidth Usage", icon: BarChart2, href: "/dashboard/bandwidth", hasArrow: true },
            { label: "Billing", icon: Wallet, href: "/dashboard/billing" },
        ],
    },
    {
        title: "ACCOUNT",
        items: [
            { label: "Settings", icon: User, href: "/dashboard/settings" },
            { label: "Resource Limits", icon: Sliders, href: "/dashboard/limits" },
            { label: "Tickets", icon: MessageSquare, href: "/dashboard/tickets" },
        ],
    },
];

const S = {
    aside: {
        width: "260px",
        minWidth: "260px",
        height: "100%",
        display: "flex",
        flexDirection: "column" as const,
        backgroundColor: "#0d1117",
        borderRight: "1px solid rgba(255,255,255,0.07)",
        flexShrink: 0,
    },
    brand: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "20px 20px 18px",
        flexShrink: 0,
        textDecoration: "none",
    },
    logoBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        background: "linear-gradient(135deg,#3b82f6,#6366f1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    brandText: {
        fontWeight: 800,
        fontSize: "1.05rem",
        color: "#fff",
        letterSpacing: "-0.02em",
    },
    nav: {
        flex: 1,
        overflowY: "auto" as const,
        overflowX: "hidden" as const,
        padding: "4px 12px 16px",
        scrollbarWidth: "none" as const,
    },
    overviewLink: (active: boolean): React.CSSProperties => ({
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "11px 12px",
        borderRadius: "10px",
        fontSize: "0.92rem",
        fontWeight: 600,
        marginBottom: "20px",
        textDecoration: "none",
        transition: "all 0.15s",
        color: active ? "#60a5fa" : "#94a3b8",
        backgroundColor: active ? "rgba(59,130,246,0.15)" : "transparent",
        cursor: "pointer",
    }),
    group: {
        marginBottom: "28px",
    },
    groupLabel: {
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.12em",
        color: "#475569",
        textTransform: "uppercase" as const,
        paddingLeft: "12px",
        marginBottom: "8px",
        display: "block",
    },
    navRow: (active: boolean): React.CSSProperties => ({
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        borderRadius: "10px",
        fontSize: "0.9rem",
        fontWeight: 600,
        textDecoration: "none",
        transition: "all 0.15s",
        color: active ? "#60a5fa" : "#94a3b8",
        backgroundColor: active ? "rgba(59,130,246,0.15)" : "transparent",
        cursor: "pointer",
        width: "100%",
        boxSizing: "border-box" as const,
        border: "none",
        textAlign: "left" as const,
        justifyContent: "space-between",
        marginBottom: "2px",
    }),
    subList: {
        marginLeft: "20px",
        paddingLeft: "14px",
        borderLeft: "1px solid rgba(100,116,139,0.2)",
        marginTop: "2px",
        marginBottom: "4px",
    },
    subRow: (active: boolean): React.CSSProperties => ({
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "9px 12px",
        borderRadius: "8px",
        fontSize: "0.875rem",
        fontWeight: 500,
        textDecoration: "none",
        transition: "all 0.15s",
        color: active ? "#e2e8f0" : "#64748b",
        backgroundColor: active ? "rgba(255,255,255,0.05)" : "transparent",
        marginBottom: "1px",
    }),
    dot: (active: boolean): React.CSSProperties => ({
        width: 6,
        height: 6,
        borderRadius: "50%",
        backgroundColor: active ? "#60a5fa" : "#475569",
        flexShrink: 0,
    }),
    footer: {
        flexShrink: 0,
        padding: "16px",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
    },
    avatar: {
        width: 34,
        height: 34,
        borderRadius: "50%",
        flexShrink: 0,
        background: "linear-gradient(135deg,#8b5cf6,#3b82f6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.8rem",
        fontWeight: 700,
        color: "#fff",
    },
};

export default function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ Compute: true });
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);

    const toggle = (label: string) =>
        setExpanded(prev => ({ ...prev, [label]: !prev[label] }));

    const isActive = (href: string) =>
        pathname === href || pathname.startsWith(href + "/");

    const rowStyle = (href: string, label: string): React.CSSProperties => {
        const active = isActive(href);
        const hovered = hoveredItem === label && !active;
        return {
            ...S.navRow(active),
            color: active ? "#60a5fa" : hovered ? "#e2e8f0" : "#94a3b8",
            backgroundColor: active ? "rgba(59,130,246,0.15)" : hovered ? "rgba(255,255,255,0.05)" : "transparent",
        };
    };

    return (
        <aside style={S.aside}>
            {/* ── Brand ── */}
            <Link href="/" style={S.brand}>
                <div style={S.logoBox}>
                    <Image src="/logo.png" alt="Logo" width={20} height={20}
                        style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} />
                </div>
                <span style={S.brandText}>
                    Not<span style={{ color: "#60a5fa" }}>Respond</span>
                </span>
            </Link>

            {/* ── Scrollable Nav ── */}
            <nav style={S.nav}>
                {/* Overview */}
                <Link
                    href="/dashboard"
                    style={S.overviewLink(pathname === "/dashboard")}
                >
                    <LayoutGrid style={{ width: 18, height: 18, flexShrink: 0 }} />
                    Overview
                </Link>

                {/* Groups */}
                {SIDEBAR_STRUCTURE.map((group) => (
                    <div key={group.title} style={S.group}>
                        <span style={S.groupLabel}>{group.title}</span>

                        {group.items.map((item) => {
                            const open = !!expanded[item.label];
                            const hasSub = !!item.subItems;
                            const style = rowStyle(item.href, item.label);

                            return (
                                <div key={item.label}>
                                    {hasSub ? (
                                        <button
                                            onClick={() => toggle(item.label)}
                                            style={style}
                                            onMouseEnter={() => setHoveredItem(item.label)}
                                            onMouseLeave={() => setHoveredItem(null)}
                                        >
                                            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                <item.icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                                                {item.label}
                                            </span>
                                            {open
                                                ? <ChevronDown style={{ width: 15, height: 15, opacity: 0.5 }} />
                                                : <ChevronRight style={{ width: 15, height: 15, opacity: 0.5 }} />}
                                        </button>
                                    ) : (
                                        <Link
                                            href={item.href}
                                            style={style}
                                            onMouseEnter={() => setHoveredItem(item.label)}
                                            onMouseLeave={() => setHoveredItem(null)}
                                        >
                                            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                <item.icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                                                {item.label}
                                            </span>
                                            {item.hasArrow && <ChevronRight style={{ width: 15, height: 15, opacity: 0.5 }} />}
                                        </Link>
                                    )}

                                    {/* Sub-items */}
                                    {hasSub && open && (
                                        <div style={S.subList}>
                                            {item.subItems!.map((sub) => {
                                                const subActive = pathname === sub.href;
                                                return (
                                                    <Link key={sub.label} href={sub.href} style={S.subRow(subActive)}>
                                                        <span style={S.dot(subActive)} />
                                                        {sub.label}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}

                {/* Admin Panel link — only rendered for ADMIN role */}
                {(session?.user as { role?: string })?.role === "ADMIN" && (
                    <div style={{ marginTop: 8, paddingTop: 16, borderTop: "1px solid rgba(245,158,11,0.15)" }}>
                        <span style={{ ...S.groupLabel, color: "#92400e" }}>ADMINISTRATION</span>
                        <Link
                            href="/dashboard/admin"
                            style={{
                                ...S.navRow(isActive("/dashboard/admin")),
                                color: isActive("/dashboard/admin") ? "#fbbf24" : "#d97706",
                                backgroundColor: isActive("/dashboard/admin")
                                    ? "rgba(245,158,11,0.15)"
                                    : "rgba(245,158,11,0.04)",
                                border: "1px solid rgba(245,158,11,0.15)",
                                marginBottom: 0,
                            }}
                            onMouseEnter={() => setHoveredItem("Admin Panel")}
                            onMouseLeave={() => setHoveredItem(null)}
                        >
                            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <Shield style={{ width: 18, height: 18, flexShrink: 0 }} />
                                Admin Panel
                            </span>
                            <span style={{ fontSize: "0.6rem", fontWeight: 800, padding: "1px 6px", borderRadius: 20, background: "rgba(245,158,11,0.2)", color: "#f59e0b", letterSpacing: "0.06em" }}>ADMIN</span>
                        </Link>
                    </div>
                )}
            </nav>

            {/* ── Anchored Footer ── */}
            <div style={S.footer}>
                <div style={S.avatar}>
                    {(session?.user?.name || session?.user?.email || "U")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                    <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.4 }}>
                        {session?.user?.name?.toUpperCase() || session?.user?.email?.split("@")[0]?.toUpperCase() || "GUEST"}
                    </p>
                    <p style={{ fontSize: "0.72rem", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.4 }}>
                        {session?.user?.email || "Not signed in"}
                    </p>
                </div>
                <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    title="Log out"
                    style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#64748b", flexShrink: 0 }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#64748b")}
                >
                    <LogOut style={{ width: 16, height: 16 }} />
                </button>
            </div>
        </aside>
    );
}
