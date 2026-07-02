"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useCredits } from "@/components/CreditProvider";
import ThemeToggle from "@/components/ThemeToggle";
import DrawerShell from "@/components/layout/DrawerShell";
import { Smartphone, Inbox, ArrowLeft, Wallet, LogOut } from "lucide-react";

/**
 * TimoSMS is waiting on a provider API (see src/lib/sms-provider.ts).
 * Flip to false once SMS_API_BASE / SMS_API_KEY are configured — the full
 * catalog + rentals UI below is intact and ready.
 */
const SMS_COMING_SOON = true;

function SmsComingSoon() {
    const t = useThemeTokens();
    return (
        <div style={{
            minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, backgroundColor: t.bgPrimary, color: t.textPrimary, fontFamily: t.fontFamily,
        }}>
            <div style={{
                width: "100%", maxWidth: 480, textAlign: "center", padding: "48px 28px",
                background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
                borderRadius: t.cardRadius, boxShadow: t.shadow,
            }}>
                <div style={{
                    width: 64, height: 64, margin: "0 auto 20px", borderRadius: t.cardRadius,
                    background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                    <Smartphone style={{ width: 30, height: 30, color: t.accentPrimary }} />
                </div>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 10 }}>
                    Timo<span style={{ color: t.accentPrimary }}>SMS</span> is coming soon
                </h1>
                <p style={{ fontSize: "0.9rem", color: t.textSecondary, lineHeight: 1.6, marginBottom: 28 }}>
                    Temporary numbers for one-time SMS codes are almost ready.
                    We&apos;re finalizing our carrier integration — check back shortly.
                </p>
                <Link href="/dashboard" style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "10px 20px", borderRadius: t.buttonRadius,
                    background: t.accentPrimary, color: t.textInverse,
                    fontWeight: 700, fontSize: "0.85rem", textDecoration: "none",
                }}>
                    <ArrowLeft style={{ width: 15, height: 15 }} /> Back to Console
                </Link>
            </div>
        </div>
    );
}

export default function SmsLayout({ children }: { children: React.ReactNode }) {
    const t = useThemeTokens();
    const pathname = usePathname() ?? "";
    const { data: session } = useSession();
    const { credits } = useCredits();

    if (SMS_COMING_SOON) return <SmsComingSoon />;

    const sidebarWidth = 280;

    const navLink = (href: string, label: string, Icon: React.ElementType, exact = true) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
            <Link href={href} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: t.buttonRadius,
                textDecoration: "none", marginBottom: 4,
                background: active ? t.accentPrimaryMuted : "transparent",
                color: active ? t.accentPrimary : t.textSecondary,
                fontWeight: 600, fontSize: "0.88rem",
                borderLeft: active ? `3px solid ${t.accentPrimary}` : "3px solid transparent",
                transition: "all 0.12s",
            }}>
                <Icon style={{ width: 16, height: 16 }} /> {label}
            </Link>
        );
    };

    return (
        <DrawerShell
            sidebarWidth={sidebarWidth}
            title={<>Timo<span style={{ color: t.accentPrimary }}>SMS</span></>}
            sidebar={
            <aside style={{
                width: sidebarWidth, minWidth: sidebarWidth, height: "100vh",
                overflowY: "auto", display: "flex", flexDirection: "column",
                background: t.isMono ? (t.isLight ? "#fafafa" : "#0a0a0a") : "rgba(10,10,15,0.98)",
                borderRight: `1px solid ${t.borderPrimary}`,
            }}>
                {/* Brand */}
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.borderPrimary}`, display: "flex", alignItems: "center", gap: 10 }}>
                    <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                        <Image src="/logo.png" alt="NotRespond" width={28} height={28} style={{ objectFit: "contain", width: 28, height: 28 }} />
                        <span style={{ fontWeight: 800, fontSize: "0.95rem", color: t.textPrimary }}>
                            Timo<span style={{ color: t.accentPrimary }}>SMS</span>
                        </span>
                    </Link>
                </div>

                {/* Nav */}
                <div style={{ padding: "12px 12px 0" }}>
                    {navLink("/sms", "Catalog", Smartphone)}
                    {navLink("/sms/rentals", "My Rentals", Inbox, false)}
                    <Link href="/dashboard" style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                        borderRadius: t.buttonRadius, textDecoration: "none", marginBottom: 4,
                        color: t.textMuted, fontWeight: 500, fontSize: "0.85rem",
                    }}>
                        <ArrowLeft style={{ width: 14, height: 14 }} /> Back to Console
                    </Link>
                </div>

                {/* Account + credits */}
                {session?.user && (
                    <div style={{ margin: "8px 12px 0", padding: 14, borderRadius: t.buttonRadius, background: t.bgCard, border: `1px solid ${t.borderSecondary}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <div style={{ width: 34, height: 34, borderRadius: t.cardRadius, background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.82rem", fontWeight: 800, color: t.accentPrimary }}>
                                {(session.user.name || session.user.email || "U")[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: "0.82rem", fontWeight: 700, color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user.name || "User"}</p>
                                <p style={{ fontSize: "0.68rem", color: t.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user.email}</p>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: t.buttonRadius, background: t.bgTertiary, fontSize: "0.75rem" }}>
                            <Wallet style={{ width: 12, height: 12, color: t.statusWarning }} />
                            <span style={{ color: t.textSecondary, fontWeight: 600 }}>Credits: </span>
                            <span style={{ color: t.accentPrimary, fontWeight: 800, fontFamily: t.fontMono }}>{credits.toLocaleString()}</span>
                        </div>
                    </div>
                )}

                {/* Bottom */}
                <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `1px solid ${t.borderPrimary}` }}>
                    <ThemeToggle variant="sidebar" />
                    {session?.user && (
                        <button onClick={() => signOut({ callbackUrl: "/" })} style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginTop: 8,
                            borderRadius: t.buttonRadius, background: "transparent", border: `1px solid ${t.borderPrimary}`,
                            color: t.textMuted, fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", width: "100%",
                        }}>
                            <LogOut style={{ width: 13, height: 13 }} /> Sign Out
                        </button>
                    )}
                </div>
            </aside>
            }
        >
            {children}
        </DrawerShell>
    );
}
