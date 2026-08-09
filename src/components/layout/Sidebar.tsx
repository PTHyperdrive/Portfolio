"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
    LayoutGrid, Server, Gamepad2, Cloud, Key, Globe, Settings as SettingsIcon,
    Users, History, BarChart2, Wallet, User, Sliders, MessageSquare, Ticket,
    ChevronDown, ChevronRight, LogOut, Shield, Bot, Mail
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useViewMode } from "@/components/ViewModeProvider";

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
            { label: "AI Studio", icon: Bot, href: "/dashboard/studio" },
            { label: "Email", icon: Mail, href: "/dashboard/mail" },
            {
                label: "Storage", icon: Cloud, href: "/dashboard/storage",
                subItems: [
                    { label: "Nextcloud", href: "/dashboard/storage/nextcloud" },
                    { label: "Block Storage", href: "/dashboard/storage/block" },
                ]
            },
            { label: "SSH Keys", icon: Key, href: "/dashboard/ssh" },
            { label: "Networks", icon: Globe, href: "/dashboard/networks", hasArrow: true },
            {
                label: "Orchestration", icon: SettingsIcon, href: "/dashboard/orchestration",
                subItems: [
                    { label: "Backups",   href: "/dashboard/orchestration/backups"   },
                    { label: "Snapshots", href: "/dashboard/orchestration/snapshots" },
                    { label: "ISOs",      href: "/dashboard/orchestration/isos"      },
                ]
            },
        ],
    },

    {
        title: "TEAM",
        items: [
            { label: "Team Management", icon: Users, href: "/dashboard/team" },
            { label: "Audit Log", icon: History, href: "/dashboard/activity" },
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
            { label: "Invitations", icon: Ticket, href: "/dashboard/invitations" },
        ],
    },
];

export default function Sidebar() {
    const pathname = usePathname() ?? "";
    const router = useRouter();
    const { data: session } = useSession();
    const { realAdmin, viewAsUser, effectiveAdmin, setViewAsUser } = useViewMode();
    const t = useThemeTokens();
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ Compute: true });
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);
    const [unreadNotifs, setUnreadNotifs] = useState(0);

    const fetchNotifs = useCallback(async () => {
        if (!session?.user) return;
        try {
            const res = await fetch("/api/notifications");
            if (res.ok) { const d = await res.json(); setUnreadNotifs(d.unread ?? 0); }
        } catch { /* silent */ }
    }, [session?.user]);

    useEffect(() => { fetchNotifs(); const iv = setInterval(fetchNotifs, 60_000); return () => clearInterval(iv); }, [fetchNotifs]);

    const toggle = (label: string) =>
        setExpanded(prev => ({ ...prev, [label]: !prev[label] }));

    const isActive = (href: string) =>
        pathname === href || pathname.startsWith(href + "/");

    /* ─── Mono-aware active indicator style ─── */
    const navRow = (href: string, label: string): React.CSSProperties => {
        const active = isActive(href);
        const hovered = hoveredItem === label && !active;
        return {
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: t.isMono ? "9px 12px" : "10px 12px",
            borderRadius: t.cardRadius,
            fontSize: "0.9rem",
            fontWeight: 600,
            textDecoration: "none",
            transition: "all 0.15s",
            cursor: "pointer",
            width: "100%",
            boxSizing: "border-box" as const,
            borderTop: "none",
            borderRight: "none",
            borderBottom: "none",
            textAlign: "left" as const,
            justifyContent: "space-between",
            marginBottom: "2px",
            /* Mono: left-border indicator; Slop: background highlight */
            borderLeft: t.isMono && active ? `3px solid ${t.accentPrimary}` : "3px solid transparent",
            color: active ? t.accentPrimary : hovered ? t.textPrimary : t.textSecondary,
            backgroundColor: active
                ? (t.isMono ? t.accentPrimaryMuted : "rgba(59,130,246,0.15)")
                : hovered
                    ? (t.isMono ? t.bgCardHover : "rgba(255,255,255,0.05)")
                    : "transparent",
        };
    };

    return (
        <aside style={{
            width: "260px",
            minWidth: "260px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: t.bgSecondary,
            borderRight: `1px solid ${t.borderPrimary}`,
            flexShrink: 0,
            fontFamily: t.fontFamily,
        }}>
            {/* ── Brand ── */}
            <Link href="/dashboard" style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "20px 20px 18px", flexShrink: 0, textDecoration: "none",
            }}>
                <div style={{
                    width: 36, height: 36, borderRadius: t.cardRadius,
                    background: t.isMono ? t.bgTertiary : "linear-gradient(135deg,#3b82f6,#6366f1)",
                    border: t.isMono ? `1px solid ${t.borderPrimary}` : "none",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                    <Image src="/logo.png" alt="Logo" width={20} height={20}
                        style={{ objectFit: "contain", filter: t.isLight ? "none" : "brightness(0) invert(1)" }} />
                </div>
                <span style={{
                    fontWeight: 800, fontSize: "1.05rem",
                    color: t.textPrimary, letterSpacing: "-0.02em",
                }}>
                    Not<span style={{ color: t.accentPrimary }}>Respond</span>
                </span>
            </Link>

            {/* ── Scrollable Nav ── */}
            <nav style={{
                flex: 1, overflowY: "auto", overflowX: "hidden",
                padding: "4px 12px 16px", scrollbarWidth: "none",
            }}>
                {/* Overview */}
                <Link
                    href="/dashboard"
                    style={{
                        display: "flex", alignItems: "center", gap: "12px",
                        padding: t.isMono ? "9px 12px" : "11px 12px",
                        borderRadius: t.cardRadius,
                        fontSize: "0.92rem", fontWeight: 600,
                        marginBottom: "20px", textDecoration: "none", transition: "all 0.15s",
                        borderLeft: "3px solid transparent",
                        color: t.textSecondary,
                        backgroundColor: "transparent",
                    }}
                >
                    <LayoutGrid style={{ width: 18, height: 18, flexShrink: 0 }} />
                    Console Home
                </Link>

                {/* Groups */}
                {SIDEBAR_STRUCTURE.map((group) => (
                    <div key={group.title} style={{ marginBottom: "28px" }}>
                        <span style={{
                            fontSize: "0.68rem", fontWeight: 700,
                            letterSpacing: "0.12em", color: t.textMuted,
                            textTransform: "uppercase", paddingLeft: "12px",
                            marginBottom: "8px", display: "block",
                        }}>{group.title}</span>

                        {group.items.map((item) => {
                            const open = !!expanded[item.label];
                            const hasSub = !!item.subItems;
                            const style = navRow(item.href, item.label);

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
                                                {item.label === "Tickets" && unreadNotifs > 0 && (
                                                    <span style={{
                                                        fontSize: "0.58rem", fontWeight: 800, minWidth: 16, textAlign: "center",
                                                        padding: "1px 5px", borderRadius: 8,
                                                        background: t.statusError, color: "#fff",
                                                    }}>{unreadNotifs}</span>
                                                )}
                                            </span>
                                            {item.hasArrow && <ChevronRight style={{ width: 15, height: 15, opacity: 0.5 }} />}
                                        </Link>
                                    )}

                                    {/* Sub-items */}
                                    {hasSub && open && (
                                        <div style={{
                                            marginLeft: "20px", paddingLeft: "14px",
                                            borderLeft: `1px solid ${t.borderSecondary}`,
                                            marginTop: "2px", marginBottom: "4px",
                                        }}>
                                            {item.subItems!.map((sub) => {
                                                const subActive = pathname === sub.href;
                                                return (
                                                    <Link key={sub.label} href={sub.href} style={{
                                                        display: "flex", alignItems: "center", gap: "10px",
                                                        padding: "9px 12px", borderRadius: t.cardRadius,
                                                        fontSize: "0.875rem", fontWeight: 500,
                                                        textDecoration: "none", transition: "all 0.15s",
                                                        color: subActive ? t.textPrimary : t.textMuted,
                                                        backgroundColor: subActive ? t.bgCardHover : "transparent",
                                                        marginBottom: "1px",
                                                    }}>
                                                        <span style={{
                                                            width: 6, height: 6, borderRadius: "50%",
                                                            backgroundColor: subActive ? t.accentPrimary : t.textMuted,
                                                            flexShrink: 0,
                                                        }} />
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

                {/* Admin Panel link — hidden while previewing as a user */}
                {effectiveAdmin && (
                    <div style={{ marginTop: 8, paddingTop: 16, borderTop: `1px solid ${t.borderSecondary}` }}>
                        <span style={{
                            fontSize: "0.68rem", fontWeight: 700,
                            letterSpacing: "0.12em", color: t.textMuted,
                            textTransform: "uppercase", paddingLeft: "12px",
                            marginBottom: "8px", display: "block",
                        }}>ADMINISTRATION</span>
                        <Link
                            href="/adminsystemnrsp"
                            style={{
                                ...navRow("/adminsystemnrsp", "Admin Panel"),
                                color: isActive("/adminsystemnrsp") ? t.statusWarning : t.textSecondary,
                                backgroundColor: isActive("/adminsystemnrsp")
                                    ? t.statusWarningBg
                                    : "transparent",
                                borderTop: t.isMono ? "none" : `1px solid ${t.statusWarningBg}`,
                                borderRight: t.isMono ? "none" : `1px solid ${t.statusWarningBg}`,
                                borderBottom: t.isMono ? "none" : `1px solid ${t.statusWarningBg}`,
                                borderLeft: t.isMono && isActive("/adminsystemnrsp") ? `3px solid ${t.statusWarning}` : "3px solid transparent",
                            }}
                            onMouseEnter={() => setHoveredItem("Admin Panel")}
                            onMouseLeave={() => setHoveredItem(null)}
                        >
                            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <Shield style={{ width: 18, height: 18, flexShrink: 0 }} />
                                Admin Panel
                            </span>
                            <span style={{
                                fontSize: "0.6rem", fontWeight: 800, padding: "1px 6px",
                                borderRadius: 20, background: t.statusWarningBg,
                                color: t.statusWarning, letterSpacing: "0.06em",
                            }}>ADMIN</span>
                        </Link>
                    </div>
                )}
            </nav>

            {/* ── View Mode switch (admins only) ── */}
            {realAdmin && (
                <div style={{ padding: "8px 16px 0" }}>
                    <button
                        onClick={() => setViewAsUser(!viewAsUser)}
                        title={viewAsUser ? "Currently viewing as a user — click to return to admin view" : "Preview the dashboard as a regular user"}
                        style={{
                            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                            gap: 10, padding: "8px 12px", cursor: "pointer",
                            borderRadius: t.cardRadius,
                            border: `1px solid ${viewAsUser ? t.accentPrimary : t.borderPrimary}`,
                            background: viewAsUser ? t.accentPrimaryMuted : "transparent",
                            color: viewAsUser ? t.accentPrimary : t.textSecondary,
                            fontSize: "0.8rem", fontWeight: 600,
                        }}
                    >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <User style={{ width: 15, height: 15 }} />
                            {viewAsUser ? "Viewing as User" : "View as User"}
                        </span>
                        {/* Toggle pill */}
                        <span style={{
                            width: 34, height: 18, borderRadius: 20, flexShrink: 0, position: "relative",
                            background: viewAsUser ? t.accentPrimary : `${t.textMuted}55`, transition: "background 0.15s",
                        }}>
                            <span style={{
                                position: "absolute", top: 2, left: viewAsUser ? 18 : 2,
                                width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.15s",
                            }} />
                        </span>
                    </button>
                </div>
            )}

            {/* ── Theme Toggle ── */}
            <div style={{ padding: "8px 16px 0" }}>
                <ThemeToggle variant="sidebar" />
            </div>

            {/* ── Anchored Footer ── */}
            <div style={{
                flexShrink: 0, padding: "12px 16px 16px",
                borderTop: `1px solid ${t.borderPrimary}`,
                display: "flex", alignItems: "center", gap: "12px",
            }}>
                <div
                    id="sidebar-profile-link"
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push("/dashboard/settings")}
                    onKeyDown={e => { if (e.key === "Enter") router.push("/dashboard/settings"); }}
                    style={{
                        display: "flex", alignItems: "center", gap: 12,
                        flex: 1, overflow: "hidden", cursor: "pointer",
                        borderRadius: 8, padding: "4px 6px", margin: "-4px -6px",
                        transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = t.bgCardHover; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                    <div style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                        background: t.isMono ? t.bgTertiary : "linear-gradient(135deg,#8b5cf6,#3b82f6)",
                        border: t.isMono ? `1px solid ${t.borderPrimary}` : "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.8rem", fontWeight: 700, color: t.textPrimary,
                    }}>
                        {(session?.user?.name || session?.user?.email || "U")[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: 700, color: t.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.4 }}>
                            {session?.user?.name?.toUpperCase() || session?.user?.email?.split("@")[0]?.toUpperCase() || "GUEST"}
                        </p>
                        <p style={{ fontSize: "0.72rem", color: t.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.4 }}>
                            {session?.user?.email || "Not signed in"}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    title="Log out"
                    style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: t.textMuted, flexShrink: 0, transition: "color 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.color = t.statusError)}
                    onMouseLeave={e => (e.currentTarget.style.color = t.textMuted)}
                >
                    <LogOut style={{ width: 16, height: 16 }} />
                </button>
            </div>
        </aside>
    );
}
