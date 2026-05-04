"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useCredits } from "@/components/CreditProvider";
import ThemeToggle from "@/components/ThemeToggle";
import {
    Shield, LayoutGrid, DollarSign, Users, Wrench,
    ClipboardList, PenSquare, Globe, Lock, Settings,
    MessageSquare, MessagesSquare, ChevronRight, LogOut,
    ArrowLeft, Wallet, Bell, Activity
} from "lucide-react";

type NavItem = { label: string; href: string; Icon: React.ElementType; badge?: number };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const t = useThemeTokens();
    const pathname = usePathname();
    const router = useRouter();
    const { data: session, status } = useSession();
    const { credits: globalCredits } = useCredits();
    const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";
    const [unreadNotifs, setUnreadNotifs] = useState(0);

    // Guard: redirect non-admin users
    useEffect(() => {
        if (status === "authenticated" && !isAdmin) {
            router.replace("/dashboard/vps");
        }
    }, [status, isAdmin, router]);

    // Fetch unread notification count
    const fetchNotifs = useCallback(async () => {
        try {
            const res = await fetch("/api/notifications");
            if (res.ok) {
                const data = await res.json();
                setUnreadNotifs(data.unread ?? 0);
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

    if (status === "loading") return null;
    if (status === "unauthenticated") {
        router.replace("/auth/login");
        return null;
    }
    if (!isAdmin) return null;

    const sidebarWidth = 280;

    const isActive = (href: string) =>
        href === "/adminsystemnrsp" ? pathname === "/adminsystemnrsp" : pathname.startsWith(href);

    const NAV_ITEMS: NavItem[] = [
        { label: "Dashboard", href: "/adminsystemnrsp", Icon: LayoutGrid },
        { label: "Tickets", href: "/adminsystemnrsp/tickets", Icon: MessageSquare, badge: unreadNotifs },
        { label: "Support Chat", href: "/adminsystemnrsp/chats", Icon: MessagesSquare },
    ];

    const MANAGEMENT_ITEMS: NavItem[] = [
        { label: "Pricing", href: "/adminsystemnrsp/pricing", Icon: DollarSign },
        { label: "Accounts", href: "/adminsystemnrsp/accounts", Icon: Users },
        { label: "Services", href: "/adminsystemnrsp/services", Icon: Wrench },
        { label: "Orders", href: "/adminsystemnrsp/orders", Icon: ClipboardList },
        { label: "Blog", href: "/adminsystemnrsp/blog", Icon: PenSquare },
        { label: "MMO Inventory", href: "/adminsystemnrsp/mmo", Icon: Globe },
        { label: "VPN Servers", href: "/adminsystemnrsp/vpn", Icon: Lock },
        { label: "System Settings", href: "/adminsystemnrsp/settings", Icon: Settings },
    ];

    const linkStyle = (href: string): React.CSSProperties => ({
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px", borderRadius: t.isMono ? 4 : 8,
        textDecoration: "none", fontSize: "0.85rem", fontWeight: 600,
        color: isActive(href) ? t.statusWarning : t.textSecondary,
        background: isActive(href) ? t.statusWarningBg : "transparent",
        borderLeft: t.isMono && isActive(href)
            ? `3px solid ${t.statusWarning}` : "3px solid transparent",
        transition: "all 0.12s",
    });

    const sectionLabel: React.CSSProperties = {
        fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em",
        color: t.textMuted, textTransform: "uppercase",
        paddingLeft: 14, marginBottom: 6, marginTop: 16, display: "block",
    };

    return (
        <div style={{
            display: "flex", height: "100vh", width: "100%", overflow: "hidden",
            backgroundColor: t.bgPrimary, color: t.textPrimary, fontFamily: t.fontFamily,
        }}>
            {/* Sidebar */}
            <aside style={{
                width: sidebarWidth, minWidth: sidebarWidth, height: "100vh",
                overflowY: "auto", display: "flex", flexDirection: "column",
                background: t.isMono
                    ? (t.isLight ? "#fafafa" : "#0a0a0a")
                    : "rgba(10,10,15,0.98)",
                borderRight: `1px solid ${t.borderPrimary}`,
            }}>
                {/* Brand */}
                <div style={{
                    padding: "16px 18px", borderBottom: `1px solid ${t.borderPrimary}`,
                    display: "flex", alignItems: "center", gap: 10,
                }}>
                    <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                        <Image src="/logo.png" alt="Notrespond" width={28} height={28}
                            style={{ objectFit: "contain", width: 28, height: 28 }} />
                        <span style={{ fontWeight: 800, fontSize: "0.9rem", color: t.textPrimary }}>
                            NRSP<span style={{ color: t.statusWarning }}> Admin</span>
                        </span>
                    </Link>
                </div>

                {/* Back to Dashboard */}
                <div style={{ padding: "10px 10px 0" }}>
                    <Link href="/dashboard/vps" style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 14px", borderRadius: t.isMono ? 4 : 8,
                        textDecoration: "none", color: t.textMuted,
                        fontSize: "0.82rem", fontWeight: 500,
                    }}>
                        <ArrowLeft style={{ width: 14, height: 14 }} /> Back to Dashboard
                    </Link>
                </div>

                {/* Core Nav */}
                <span style={sectionLabel}>OPERATIONS</span>
                <div style={{ padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                    {NAV_ITEMS.map(item => (
                        <Link key={item.label} href={item.href} style={linkStyle(item.href)}>
                            <item.Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{item.label}</span>
                            {item.badge && item.badge > 0 ? (
                                <span style={{
                                    fontSize: "0.6rem", fontWeight: 800,
                                    padding: "1px 7px", borderRadius: 10,
                                    background: t.statusError, color: "#fff",
                                    minWidth: 18, textAlign: "center",
                                }}>{item.badge}</span>
                            ) : null}
                        </Link>
                    ))}
                </div>

                {/* Management Nav */}
                <span style={sectionLabel}>MANAGEMENT</span>
                <div style={{ padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                    {MANAGEMENT_ITEMS.map(item => (
                        <Link key={item.label} href={item.href} style={linkStyle(item.href)}>
                            <item.Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{item.label}</span>
                            <ChevronRight style={{ width: 12, height: 12, color: t.textMuted, opacity: 0.5 }} />
                        </Link>
                    ))}
                </div>

                {/* Bottom */}
                <div style={{ marginTop: "auto", padding: "12px 14px", borderTop: `1px solid ${t.borderPrimary}` }}>
                    {/* Credit display */}
                    <div style={{
                        display: "flex", alignItems: "center", gap: 7,
                        padding: "8px 12px", borderRadius: t.isMono ? 4 : 8,
                        background: t.bgTertiary, marginBottom: 8,
                    }}>
                        <Wallet style={{ width: 13, height: 13, color: t.statusWarning }} />
                        <span style={{ fontSize: "0.78rem", color: t.textSecondary, fontWeight: 600 }}>Credits:</span>
                        <span style={{ fontSize: "0.78rem", fontWeight: 800, color: t.accentPrimary, fontFamily: t.fontMono }}>
                            {globalCredits.toLocaleString()}
                        </span>
                    </div>

                    <ThemeToggle variant="sidebar" />

                    {/* User + Sign Out */}
                    {session?.user && (
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                                width: 30, height: 30, borderRadius: t.isMono ? 4 : 8,
                                background: t.statusWarningBg, display: "flex",
                                alignItems: "center", justifyContent: "center",
                                fontSize: "0.78rem", fontWeight: 800, color: t.statusWarning,
                            }}>
                                {(session.user.name || session.user.email || "A")[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                    fontSize: "0.78rem", fontWeight: 700, color: t.textPrimary,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>{session.user.name || "Admin"}</p>
                                <p style={{
                                    fontSize: "0.65rem", color: t.statusWarning,
                                    fontWeight: 600,
                                }}>Administrator</p>
                            </div>
                            <button onClick={() => signOut({ callbackUrl: "/" })} style={{
                                width: 28, height: 28, borderRadius: t.isMono ? 4 : 6,
                                border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                color: t.textMuted, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                <LogOut style={{ width: 13, height: 13 }} />
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <main style={{
                flex: 1, overflowY: "auto", position: "relative",
                backgroundColor: t.bgPrimary,
            }}>
                {children}
            </main>
        </div>
    );
}
