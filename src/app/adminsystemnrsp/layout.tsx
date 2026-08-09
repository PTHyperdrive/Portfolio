"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useCredits } from "@/components/CreditProvider";
import ThemeToggle from "@/components/ThemeToggle";
import DrawerShell from "@/components/layout/DrawerShell";
import {
    LayoutGrid, Server, Users, Tag, Receipt,
    ScrollText, MessageSquare, MessagesSquare, SlidersHorizontal,
    LogOut, ArrowLeft, Wallet, Shield, Store, FileText,
    Activity, Network, Smartphone, Bot, Mail,
} from "lucide-react";

type NavItem = { label: string; href: string; Icon: React.ElementType; badge?: number };

const SUPPORT_ITEMS: NavItem[] = [
    { label: "Tickets",          href: "/adminsystemnrsp/tickets",      Icon: MessageSquare    },
    { label: "Secure Chat",      href: "/adminsystemnrsp/chats",        Icon: MessagesSquare   },
];

const INFRA_ITEMS: NavItem[] = [
    { label: "Infrastructure",   href: "/adminsystemnrsp/infrastructure", Icon: Activity        },
    { label: "VPC Networks",     href: "/adminsystemnrsp/vpcs",           Icon: Network         },
    { label: "WireGuard Peers",  href: "/adminsystemnrsp/wireguard",      Icon: Shield          },
    { label: "AI Nodes",         href: "/adminsystemnrsp/ai",             Icon: Bot             },
    { label: "Email Server",     href: "/adminsystemnrsp/mail",           Icon: Mail            },
];

const ADMIN_ITEMS: NavItem[] = [
    { label: "Dashboard",        href: "/adminsystemnrsp",              Icon: LayoutGrid       },
    { label: "Server Management",href: "/adminsystemnrsp/servers",      Icon: Server           },
    { label: "User Accounts",    href: "/adminsystemnrsp/accounts",     Icon: Users            },
    { label: "Pricing & Promo",  href: "/adminsystemnrsp/pricing",      Icon: Tag              },
    { label: "Billing & Invoices",href: "/adminsystemnrsp/billing",     Icon: Receipt          },
    { label: "Audit Logs",       href: "/adminsystemnrsp/audit-logs",   Icon: ScrollText       },
    { label: "MMO Admin",        href: "/adminsystemnrsp/mmo",          Icon: Store            },
    { label: "TimoSMS",          href: "/adminsystemnrsp/sms",          Icon: Smartphone       },
    { label: "CMS",              href: "/adminsystemnrsp/cms",          Icon: FileText         },
    { label: "System Settings",  href: "/adminsystemnrsp/settings",     Icon: SlidersHorizontal},
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const t = useThemeTokens();
    const pathname = usePathname();
    const router = useRouter();
    const { data: session, status } = useSession();
    const { credits: globalCredits } = useCredits();
    const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";
    const [unreadTickets, setUnreadTickets] = useState(0);

    useEffect(() => {
        if (status === "authenticated" && !isAdmin) router.replace("/dashboard/vps");
    }, [status, isAdmin, router]);

    const fetchNotifs = useCallback(async () => {
        try {
            const res = await fetch("/api/notifications");
            if (res.ok) { const d = await res.json(); setUnreadTickets(d.unread ?? 0); }
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchNotifs();
        const iv = setInterval(fetchNotifs, 60_000);
        return () => clearInterval(iv);
    }, [fetchNotifs]);

    if (status === "loading") return null;
    if (status === "unauthenticated") { router.replace("/auth/login"); return null; }
    if (!isAdmin) return null;

    // Exact match for dashboard root, prefix match for subpages
    const isActive = (href: string) =>
        href === "/adminsystemnrsp"
            ? pathname === "/adminsystemnrsp"
            : (pathname ?? "").startsWith(href);

    const linkStyle = (href: string): React.CSSProperties => {
        const active = isActive(href);
        return {
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", borderRadius: t.cardRadius,
            textDecoration: "none", fontSize: "0.85rem", fontWeight: 600,
            color: active ? t.statusWarning : t.textSecondary,
            background: active ? t.statusWarningBg : "transparent",
            borderLeft: `3px solid ${active ? t.statusWarning : "transparent"}`,
            transition: "all 0.12s",
        };
    };

    const sectionLabel: React.CSSProperties = {
        fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.14em",
        color: t.textMuted, textTransform: "uppercase" as const,
        paddingLeft: 12, marginBottom: 4, marginTop: 10, display: "block",
    };

    const renderNavItem = (item: NavItem) => {
        const showBadge = item.label === "Tickets" && unreadTickets > 0;
        return (
            <Link key={item.label} href={item.href} style={linkStyle(item.href)}>
                <item.Icon style={{ width: 15, height: 15, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {showBadge && (
                    <span style={{
                        fontSize: "0.6rem", fontWeight: 800, minWidth: 16, textAlign: "center",
                        padding: "1px 5px", borderRadius: 8,
                        background: t.statusError, color: "#fff",
                    }}>{unreadTickets}</span>
                )}
            </Link>
        );
    };
    return (
        <DrawerShell
            sidebarWidth={264}
            title={<>NRSP<span style={{ color: t.statusWarning }}> Admin</span></>}
            sidebar={
            <aside style={{
                width: 264, minWidth: 264, height: "100vh", overflowY: "auto",
                display: "flex", flexDirection: "column",
                background: t.bgSecondary,
                borderRight: `1px solid ${t.borderPrimary}`,
            }}>
                {/* Brand */}
                <div style={{
                    padding: "14px 16px", borderBottom: `1px solid ${t.borderPrimary}`,
                    display: "flex", alignItems: "center", gap: 10,
                }}>
                    <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                        <Image src="/logo.png" alt="Notrespond" width={26} height={26}
                            style={{ objectFit: "contain" }} />
                        <span style={{ fontWeight: 800, fontSize: "0.88rem", color: t.textPrimary }}>
                            NRSP<span style={{ color: t.statusWarning }}> Admin</span>
                        </span>
                    </Link>
                    <span style={{ marginLeft: "auto", fontSize: "0.58rem", fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: t.statusWarningBg, color: t.statusWarning, letterSpacing: "0.08em" }}>
                        ADMIN
                    </span>
                </div>

                {/* Back link */}
                <div style={{ padding: "8px 8px 0" }}>
                    <Link href="/dashboard/vps" style={{
                        display: "flex", alignItems: "center", gap: 7, padding: "7px 12px",
                        borderRadius: t.cardRadius, textDecoration: "none",
                        color: t.textMuted, fontSize: "0.78rem", fontWeight: 500,
                    }}>
                        <ArrowLeft style={{ width: 13, height: 13 }} /> Back to Dashboard
                    </Link>
                </div>

                {/* Navigation — Two Groups */}
                <nav style={{ flex: 1, padding: "4px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={sectionLabel}>SUPPORT</span>
                    {SUPPORT_ITEMS.map(renderNavItem)}

                    <span style={{ ...sectionLabel, marginTop: 16 }}>INFRASTRUCTURE</span>
                    {INFRA_ITEMS.map(renderNavItem)}

                    <span style={{ ...sectionLabel, marginTop: 16 }}>ADMINISTRATION</span>
                    {ADMIN_ITEMS.map(renderNavItem)}
                </nav>

                {/* Footer */}
                <div style={{ padding: "10px 12px 14px", borderTop: `1px solid ${t.borderPrimary}`, flexShrink: 0 }}>
                    {/* Credit display */}
                    <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "7px 10px", borderRadius: t.cardRadius,
                        background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`,
                        marginBottom: 8,
                    }}>
                        <Wallet style={{ width: 12, height: 12, color: t.statusWarning }} />
                        <span style={{ fontSize: "0.72rem", color: t.textMuted, fontWeight: 600 }}>Credits</span>
                        <span style={{ fontSize: "0.72rem", fontWeight: 800, color: t.accentPrimary, fontFamily: t.fontMono, marginLeft: "auto" }}>
                            {globalCredits.toLocaleString()}
                        </span>
                    </div>

                    <ThemeToggle variant="sidebar" />

                    {/* User row */}
                    {session?.user && (
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: t.buttonRadius,
                                background: t.statusWarningBg, display: "flex",
                                alignItems: "center", justifyContent: "center",
                                fontSize: "0.72rem", fontWeight: 800, color: t.statusWarning, flexShrink: 0,
                            }}>
                                {(session.user.name || session.user.email || "A")[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                    fontSize: "0.75rem", fontWeight: 700, color: t.textPrimary,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>{session.user.name || "Admin"}</p>
                                <p style={{ fontSize: "0.62rem", color: t.statusWarning, fontWeight: 600 }}>Administrator</p>
                            </div>
                            <button onClick={() => signOut({ callbackUrl: "/" })} title="Sign out" style={{
                                width: 26, height: 26, borderRadius: t.buttonRadius, flexShrink: 0,
                                border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                color: t.textMuted, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                <LogOut style={{ width: 12, height: 12 }} />
                            </button>
                        </div>
                    )}
                </div>
            </aside>
            }
        >
            {children}
        </DrawerShell>
    );
}
