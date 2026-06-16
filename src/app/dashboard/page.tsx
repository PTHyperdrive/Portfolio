"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useIsMobile } from "@/lib/useIsMobile";
import { useCredits } from "@/components/CreditProvider";
import { useViewMode } from "@/components/ViewModeProvider";
import AccountDropdown from "@/components/layout/AccountDropdown";
import {
    Server, HardDrive, Globe, Wallet, ShoppingBag,
    KeyRound, Users, MessageSquare, Plus, CreditCard,
    Ticket, CloudUpload, LayoutGrid,
    AlertTriangle, ArrowRight, Shield, Smartphone
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ─── Types ─── */

interface OverviewData {
    user: {
        id: string;
        name: string | null;
        email: string;
        credits: number;
        twoFactorEnabled: boolean;
        activePlan: string | null;
    };
    vpsInstances: {
        id: string;
        vmId: string;
        name: string;
        status: string;
    }[];
}

interface ServiceCard {
    label: string;
    description: string;
    Icon: LucideIcon;
    href: string;
    color: string;
}

/* ─── Helpers ─── */

function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
}

function planDisplayName(plan: string | null | undefined): string {
    if (!plan) return "No active plan";
    const map: Record<string, string> = {
        free_trial: "Free Trial",
        starter: "Starter",
        pro: "Pro",
        enterprise: "Enterprise",
    };
    return map[plan] ?? plan;
}

/* ─── Component ─── */

interface BurnForecast {
    totalHourlySpent: number;
    totalVmHours: number;
    burn: { hourly: number };
    runway: { days: number | null; hours: number | null };
}

export default function ConsoleHubPage() {
    const [data, setData] = useState<OverviewData | null>(null);
    const [forecast, setForecast] = useState<BurnForecast | null>(null);
    const [loading, setLoading] = useState(true);
    const t = useThemeTokens();
    const isMobile = useIsMobile();
    const { credits: globalCredits } = useCredits();
    const { data: session } = useSession();

    useEffect(() => {
        fetch("/api/overview")
            .then(r => r.json())
            .then(d => { if (!d.error) setData(d); })
            .finally(() => setLoading(false));

        fetch("/api/billing/forecast")
            .then(r => r.json())
            .then(d => { if (!d.error) setForecast(d); })
            .catch(() => {});
    }, []);

    /* ─── Derived ─── */
    const user = data?.user;
    const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";
    const vpsCount = data?.vpsInstances?.length ?? 0;
    const runningCount = data?.vpsInstances?.filter(v => v.status === "running").length ?? 0;
    const currentPlan = planDisplayName(
        user?.activePlan
        ?? (session?.user as Record<string, unknown>)?.activePlan as string | null
    );
    const { effectiveAdmin: isAdmin } = useViewMode();

    /* ─── Style helpers ─── */
    const card = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    } as React.CSSProperties;

    /* ─── Quick Actions ─── */
    const QUICK_ACTIONS = [
        { label: "Create a VM", href: "/dashboard/billing", Icon: Plus },
        { label: "Add Credit", href: "/dashboard/billing", Icon: CreditCard },
        { label: "Open a Ticket", href: "/dashboard/tickets", Icon: Ticket },
        { label: "Deploy Storage", href: "/dashboard/storage", Icon: CloudUpload },
    ];

    /* ─── Service Cards ─── */
    const SERVICE_CARDS: ServiceCard[] = [
        { label: "Compute Engine", description: "Virtual machines & bare metal", Icon: Server, href: "/dashboard/vps", color: t.accentPrimary },
        { label: "Storage & Backups", description: "Nextcloud, block storage, snapshots", Icon: HardDrive, href: "/dashboard/storage", color: t.statusSuccess },
        { label: "Network", description: "VPN, proxy, DNS configuration", Icon: Globe, href: "/dashboard/networks", color: t.accentSecondary },
        { label: "Billing & Credits", description: `${globalCredits.toLocaleString()} credits available`, Icon: Wallet, href: "/dashboard/billing", color: t.statusWarning },
        { label: "SSH Keys", description: "Manage authentication keys", Icon: KeyRound, href: "/dashboard/ssh", color: t.textSecondary },
        { label: "Team & IAM", description: "Members, roles, audit log", Icon: Users, href: "/dashboard/team", color: t.accentPrimary },
        { label: "Support Tickets", description: "Get help from NRSP Cloud", Icon: MessageSquare, href: "/dashboard/tickets", color: t.statusSuccess },
    ];

    /* ─── Loading State ─── */
    if (loading) {
        return (
            <div style={{
                minHeight: "100vh", display: "flex", alignItems: "center",
                justifyContent: "center", backgroundColor: t.bgPrimary,
            }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: "50%",
                        border: `3px solid ${t.borderPrimary}`,
                        borderTopColor: t.accentPrimary,
                        animation: "spin 0.8s linear infinite",
                        margin: "0 auto 16px",
                    }} />
                    <p style={{ color: t.textMuted, fontSize: "0.875rem" }}>Loading console...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: "100vh",
            backgroundColor: t.bgPrimary,
            padding: isMobile ? "0 16px 32px" : "0 48px 48px",
            overflowX: "hidden",
        }}>
            {/* ─── Top Navbar ─── */}
            <nav style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 0", borderBottom: `1px solid ${t.borderPrimary}`,
                marginBottom: 32,
            }}>
                {/* Left — Logo */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Image
                        src="/logo.png" alt="NRSP Cloud" width={32} height={32}
                        style={{ objectFit: "contain", filter: t.isLight ? "none" : "brightness(0) invert(1)" }}
                    />
                    <span style={{
                        fontWeight: 800, fontSize: "1.05rem", color: t.textPrimary,
                        letterSpacing: "-0.02em",
                    }}>
                        Not<span style={{ color: t.accentPrimary }}>Respond</span>
                    </span>
                </div>

                {/* Center — Nav Links (hidden on mobile; available via marketing pages) */}
                <div style={{ display: isMobile ? "none" : "flex", alignItems: "center", gap: 6 }}>
                    {[
                        { label: "News", href: "/news" },
                        { label: "Blogs", href: "/blog" },
                        { label: "FAQs", href: "/faq" },
                        { label: "Docs", href: "/docs" },
                    ].map(link => (
                        <Link
                            key={link.href}
                            href={link.href}
                            id={`nav-${link.label.toLowerCase()}`}
                            style={{
                                padding: "8px 16px", borderRadius: t.cardRadius,
                                fontSize: "0.85rem", fontWeight: 600,
                                color: t.textSecondary, textDecoration: "none",
                                transition: "all 0.15s",
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.color = t.textPrimary;
                                e.currentTarget.style.background = t.bgCardHover;
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.color = t.textSecondary;
                                e.currentTarget.style.background = "transparent";
                            }}
                        >
                            {link.label}
                        </Link>
                    ))}
                </div>

                {/* Right — Account */}
                <AccountDropdown />
            </nav>

            {/* ─── Admin Banner ─── */}
            {isAdmin && (
                <div
                    id="admin-banner"
                    style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        flexWrap: "wrap", gap: 12,
                        padding: "14px 20px", marginBottom: 16, borderRadius: t.cardRadius,
                        background: t.accentPrimaryMuted,
                        border: `1px solid ${t.accentPrimary}33`,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Shield style={{ width: 20, height: 20, color: t.accentPrimary, flexShrink: 0 }} />
                        <p style={{ fontSize: "0.875rem", color: t.textPrimary, lineHeight: 1.5 }}>
                            You are signed in as <span style={{ fontWeight: 700 }}>Administrator</span>. You have access to the system admin panel.
                        </p>
                    </div>
                    <Link
                        href="/adminsystemnrsp"
                        id="admin-panel-link"
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "8px 18px", borderRadius: t.buttonRadius,
                            background: t.accentPrimary, color: t.textInverse,
                            fontSize: "0.82rem", fontWeight: 700,
                            textDecoration: "none", whiteSpace: "nowrap",
                            transition: "opacity 0.15s",
                        }}
                    >
                        <Shield style={{ width: 13, height: 13 }} />
                        Open Admin Panel
                    </Link>
                </div>
            )}

            {/* ─── 2FA Warning ─── */}
            {user && !user.twoFactorEnabled && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 20px", marginBottom: 24, borderRadius: t.cardRadius,
                    background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`,
                    color: t.statusWarning,
                }}>
                    <AlertTriangle style={{ width: 20, height: 20, flexShrink: 0 }} />
                    <p style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
                        Two-factor authentication is not enabled.{" "}
                        <Link href="/dashboard/settings" style={{ color: t.accentPrimary, fontWeight: 700, textDecoration: "underline" }}>
                            Enable now
                        </Link>
                    </p>
                </div>
            )}

            {/* ─── Welcome Header ─── */}
            <div style={{ marginBottom: 32 }}>
                <h1 style={{
                    fontSize: "1.8rem", fontWeight: 400, color: t.textPrimary,
                    marginBottom: 8, letterSpacing: "-0.01em",
                    fontFamily: t.fontFamily,
                }}>
                    {getGreeting()}, {firstName}
                </h1>
                <p style={{ fontSize: "0.9rem", color: t.textSecondary }}>
                    Current plan: <span style={{ fontWeight: 700, color: t.accentPrimary }}>{currentPlan}</span>
                </p>
            </div>

            {/* ─── Stats Row ─── */}
            <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16, marginBottom: 32,
            }}>
                {/* Credit Balance */}
                <div style={{ ...card, padding: "20px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: t.cardRadius,
                            background: t.statusWarningBg, display: "flex",
                            alignItems: "center", justifyContent: "center",
                        }}>
                            <Wallet style={{ width: 18, height: 18, color: t.statusWarning }} />
                        </div>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            Credit Balance
                        </span>
                    </div>
                    <p style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary, fontFamily: t.fontMono }}>
                        {globalCredits.toLocaleString()}
                    </p>
                    {forecast && (
                        <p style={{ fontSize: "0.75rem", color: forecast.burn.hourly > 0 && (forecast.runway.days ?? 99) <= 3 ? t.statusError : t.textMuted, marginTop: 4 }}>
                            {forecast.burn.hourly > 0
                                ? `Burning ${forecast.burn.hourly.toLocaleString()}/hr · ${forecast.runway.days}d ${(forecast.runway.hours ?? 0) % 24}h left · ${forecast.totalVmHours.toLocaleString()} VM-hrs used`
                                : `No hourly charges · ${forecast.totalVmHours.toLocaleString()} VM-hrs used to date`}
                        </p>
                    )}
                    <Link href="/dashboard/billing" style={{
                        fontSize: "0.78rem", color: t.accentPrimary, textDecoration: "none",
                        fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6,
                    }}>
                        Add credit <ArrowRight style={{ width: 12, height: 12 }} />
                    </Link>
                </div>

                {/* Active VMs */}
                <div style={{ ...card, padding: "20px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: t.cardRadius,
                            background: t.accentPrimaryMuted, display: "flex",
                            alignItems: "center", justifyContent: "center",
                        }}>
                            <Server style={{ width: 18, height: 18, color: t.accentPrimary }} />
                        </div>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            Virtual Machines
                        </span>
                    </div>
                    <p style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary, fontFamily: t.fontMono }}>
                        {vpsCount}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: t.textMuted, marginTop: 6 }}>
                        {runningCount} running
                    </p>
                </div>

                {/* Current Plan */}
                <div style={{ ...card, padding: "20px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: t.cardRadius,
                            background: t.statusSuccessBg, display: "flex",
                            alignItems: "center", justifyContent: "center",
                        }}>
                            <CreditCard style={{ width: 18, height: 18, color: t.statusSuccess }} />
                        </div>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            Active Plan
                        </span>
                    </div>
                    <p style={{ fontSize: "1.2rem", fontWeight: 800, color: t.textPrimary }}>
                        {currentPlan}
                    </p>
                    <Link href="/dashboard/billing" style={{
                        fontSize: "0.78rem", color: t.accentPrimary, textDecoration: "none",
                        fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6,
                    }}>
                        Manage plan <ArrowRight style={{ width: 12, height: 12 }} />
                    </Link>
                </div>
            </div>

            {/* ─── MMO Marketplace Banner ─── */}
            <Link
                href="/mmo"
                id="mmo-marketplace-banner"
                style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "18px 24px", marginBottom: 32,
                    borderRadius: t.cardRadius,
                    background: t.bgCard,
                    border: `1px solid ${t.statusError}33`,
                    borderLeft: `3px solid ${t.statusError}`,
                    boxShadow: t.shadow,
                    textDecoration: "none",
                    transition: "all 0.15s",
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.borderLeftColor = t.statusError;
                    e.currentTarget.style.background = t.bgCardHover;
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.borderLeftColor = t.statusError;
                    e.currentTarget.style.background = t.bgCard;
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: t.cardRadius,
                        background: `${t.statusError}1a`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <ShoppingBag style={{ width: 20, height: 20, color: t.statusError }} />
                    </div>
                    <div>
                        <p style={{ fontSize: "0.95rem", fontWeight: 700, color: t.textPrimary }}>
                            MMO Marketplace
                        </p>
                        <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 2 }}>
                            Game accounts & digital assets
                        </p>
                    </div>
                </div>
                <ArrowRight style={{ width: 16, height: 16, color: t.textMuted }} />
            </Link>

            {/* ─── TimoSMS Banner ─── */}
            <Link
                href="/sms"
                id="timosms-banner"
                style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "18px 24px", marginBottom: 32,
                    borderRadius: t.cardRadius,
                    background: t.bgCard,
                    border: `1px solid ${t.accentPrimary}33`,
                    borderLeft: `3px solid ${t.accentPrimary}`,
                    boxShadow: t.shadow,
                    textDecoration: "none",
                    transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = t.bgCardHover; }}
                onMouseLeave={e => { e.currentTarget.style.background = t.bgCard; }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: t.cardRadius,
                        background: t.accentPrimaryMuted,
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <Smartphone style={{ width: 20, height: 20, color: t.accentPrimary }} />
                    </div>
                    <div>
                        <p style={{ fontSize: "0.95rem", fontWeight: 700, color: t.textPrimary }}>
                            TimoSMS — Rent a Number
                        </p>
                        <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 2 }}>
                            Temporary numbers for one-time SMS codes
                        </p>
                    </div>
                </div>
                <ArrowRight style={{ width: 16, height: 16, color: t.textMuted }} />
            </Link>

            {/* ─── Quick Actions ─── */}
            <div style={{ marginBottom: 36 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {QUICK_ACTIONS.map(a => (
                        <Link key={a.label} href={a.href} id={`qa-${a.label.toLowerCase().replace(/\s+/g, "-")}`} style={{
                            display: "inline-flex", alignItems: "center", gap: 8,
                            padding: "10px 20px", borderRadius: t.buttonRadius,
                            background: t.accentPrimaryMuted,
                            border: `1px solid ${t.accentPrimary}33`,
                            color: t.accentPrimary, fontSize: "0.85rem", fontWeight: 600,
                            textDecoration: "none", transition: "all 0.15s",
                        }}>
                            <a.Icon style={{ width: 15, height: 15 }} />
                            {a.label}
                        </Link>
                    ))}
                </div>
            </div>

            {/* ─── Quick Access — Service Cards ─── */}
            <div style={{ marginBottom: 48 }}>
                <h2 style={{
                    fontSize: "1.1rem", fontWeight: 700, color: t.textPrimary,
                    marginBottom: 20,
                }}>
                    Quick access
                </h2>

                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 14,
                }}>
                    {SERVICE_CARDS.map(svc => {
                        const isMmo = svc.label === "MMO Marketplace";
                        return (
                        <Link
                            key={svc.label}
                            href={svc.href}
                            id={`svc-${svc.label.toLowerCase().replace(/\s+/g, "-")}`}
                            style={{
                                ...card,
                                padding: "20px 22px",
                                textDecoration: "none",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 14,
                                transition: "all 0.15s",
                                cursor: "pointer",
                                ...(isMmo ? {
                                    borderLeft: `3px solid ${svc.color}`,
                                    background: svc.color + "08",
                                } : {}),
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = svc.color + "55";
                                e.currentTarget.style.background = isMmo ? svc.color + "14" : t.bgCardHover;
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = isMmo ? svc.color : t.borderPrimary;
                                e.currentTarget.style.background = isMmo ? svc.color + "08" : t.bgCard;
                                if (isMmo) e.currentTarget.style.borderLeftColor = svc.color;
                            }}
                        >
                            <div style={{
                                width: 40, height: 40, borderRadius: t.cardRadius,
                                background: svc.color + "18",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0,
                            }}>
                                <svc.Icon style={{ width: 20, height: 20, color: svc.color }} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <p style={{
                                    fontSize: "0.9rem", fontWeight: 700, color: t.textPrimary,
                                    marginBottom: 3,
                                }}>
                                    {svc.label}
                                </p>
                                <p style={{
                                    fontSize: "0.78rem", color: t.textMuted, lineHeight: 1.4,
                                }}>
                                    {svc.description}
                                </p>
                            </div>
                        </Link>
                        );
                    })}
                </div>
            </div>

            {/* ─── View All Products Link ─── */}
            <div style={{ textAlign: "center" }}>
                <Link
                    href="/services/vps"
                    id="view-all-products"
                    style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        fontSize: "0.88rem", color: t.accentPrimary, textDecoration: "none",
                        fontWeight: 600, padding: "10px 24px",
                        borderRadius: t.buttonRadius,
                        border: `1px solid ${t.accentPrimary}33`,
                        transition: "all 0.15s",
                    }}
                >
                    <LayoutGrid style={{ width: 16, height: 16 }} />
                    View all products
                </Link>
            </div>
        </div>
    );
}
