"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import ThemeToggle from "@/components/ThemeToggle";
import { useThemeTokens } from "@/lib/useThemeTokens";

function NavLink({ href, label, pathname, t }: {
    href: string; label: string; pathname: string;
    t: ReturnType<typeof useThemeTokens>;
}) {
    const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
        <Link
            href={href}
            style={{
                padding: "8px 16px",
                borderRadius: t.isMono ? 4 : 8,
                fontSize: "0.88rem",
                fontWeight: 500,
                color: isActive ? t.accentPrimary : t.textSecondary,
                background: isActive ? t.accentPrimaryMuted : "transparent",
                textDecoration: "none",
                transition: "all 0.2s ease",
            }}
        >
            {label}
        </Link>
    );
}

function MobileLink({ href, label, pathname, t }: {
    href: string; label: string; pathname: string;
    t: ReturnType<typeof useThemeTokens>;
}) {
    return (
        <Link
            href={href}
            style={{
                padding: "12px 16px",
                borderRadius: t.isMono ? 4 : 8,
                color: pathname === href ? t.accentPrimary : t.textSecondary,
                textDecoration: "none",
                fontSize: "0.95rem",
            }}
        >
            {label}
        </Link>
    );
}

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const pathname = usePathname();
    const { data: session, status } = useSession();
    const t = useThemeTokens();

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // ── While session is loading, render a skeleton to prevent flash ──
    if (status === "loading") {
        if (pathname.startsWith("/dashboard")) return null;
        return (
            <nav
                style={{
                    position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
                    padding: "20px 0", background: "transparent",
                }}
            >
                <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
                        <Image src="/logo.png" alt="Notrespond.com" width={140} height={36} style={{ objectFit: "contain", width: "auto", height: "36px" }} priority />
                        <span style={{ fontWeight: 700, fontSize: "1.15rem", color: t.textPrimary, letterSpacing: "-0.02em" }}>
                            Notrespond<span style={{ color: t.accentPrimary }}>.com</span>
                        </span>
                    </Link>
                    <div style={{ display: "flex", gap: "8px" }}>
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} style={{ width: 60, height: 28, borderRadius: t.isMono ? 4 : 8, background: t.bgCard }} />
                        ))}
                    </div>
                </div>
            </nav>
        );
    }

    const loggedIn = !!session;

    if (pathname.startsWith("/dashboard")) return null;

    const navBg = scrolled
        ? (t.isMono
            ? (t.isLight ? "rgba(255,255,255,0.92)" : "rgba(26,26,26,0.92)")
            : "rgba(10, 10, 15, 0.85)")
        : "transparent";

    return (
        <nav
            style={{
                position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
                padding: scrolled ? "12px 0" : "20px 0",
                background: navBg,
                backdropFilter: scrolled ? "blur(20px)" : "none",
                borderBottom: scrolled ? `1px solid ${t.borderPrimary}` : "none",
                transition: "all 0.3s ease",
            }}
        >
            <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {/* Logo */}
                <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
                    <Image src="/logo.png" alt="Notrespond.com" width={140} height={36} style={{ objectFit: "contain", width: "auto", height: "36px" }} priority />
                    <span style={{ fontWeight: 700, fontSize: "1.15rem", color: t.textPrimary, letterSpacing: "-0.02em" }}>
                        Notrespond<span style={{ color: t.accentPrimary }}>.com</span>
                    </span>
                </Link>

                {/* Desktop Links */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }} className="nav-desktop">
                    <NavLink href="/" label="Home" pathname={pathname} t={t} />
                    {!loggedIn && <NavLink href="/services/vps" label="VPS" pathname={pathname} t={t} />}
                    {!loggedIn && <NavLink href="/services/email" label="Email" pathname={pathname} t={t} />}
                    {!loggedIn && <NavLink href="/services/vpn" label="VPN" pathname={pathname} t={t} />}
                    {!loggedIn && <NavLink href="/services/proxy" label="Proxy" pathname={pathname} t={t} />}
                    <NavLink href="/blog" label="Blog" pathname={pathname} t={t} />
                    {loggedIn && <NavLink href="/dashboard/vps" label="Dashboard" pathname={pathname} t={t} />}
                    {loggedIn && <NavLink href="/settings" label="Settings" pathname={pathname} t={t} />}
                    {loggedIn && <NavLink href="/dashboard/billing" label="Billing" pathname={pathname} t={t} />}
                </div>

                {/* Auth Area + Theme Toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }} className="nav-auth">
                    <ThemeToggle variant="navbar" />

                    {loggedIn ? (
                        <>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: t.isMono ? 6 : 10,
                                    background: t.isMono ? t.bgTertiary : "var(--gradient-primary)",
                                    border: t.isMono ? `1px solid ${t.borderPrimary}` : "none",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontWeight: 700, fontSize: "0.8rem", color: t.textPrimary,
                                }}>
                                    {(session.user?.name || session.user?.email || "U")[0].toUpperCase()}
                                </div>
                                <span style={{ fontSize: "0.85rem", color: t.textSecondary, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {session.user?.name || session.user?.email}
                                </span>
                            </div>
                            <button onClick={() => signOut({ callbackUrl: typeof window !== "undefined" ? window.location.origin : "/" })} className="btn btn-ghost" style={{ padding: "7px 16px", fontSize: "0.82rem" }}>
                                Sign Out
                            </button>
                        </>
                    ) : (
                        <>
                            <Link href="/auth/login" className="btn btn-ghost" style={{ padding: "8px 20px", fontSize: "0.85rem" }}>Log In</Link>
                            <Link href="/auth/register" className="btn btn-primary" style={{ padding: "8px 20px", fontSize: "0.85rem" }}>Sign Up</Link>
                        </>
                    )}
                </div>

                {/* Mobile Menu Button */}
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="nav-mobile-btn"
                    style={{ display: "none", background: "none", border: "none", color: t.textPrimary, cursor: "pointer", padding: 8 }}
                    aria-label="Toggle menu"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {mobileOpen ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
                    </svg>
                </button>
            </div>

            {/* Mobile Dropdown */}
            {mobileOpen && (
                <div
                    className="nav-mobile-menu"
                    style={{
                        position: "absolute", top: "100%", left: 0, right: 0,
                        background: t.isMono
                            ? (t.isLight ? "rgba(255,255,255,0.97)" : "rgba(26,26,26,0.97)")
                            : "rgba(10, 10, 15, 0.95)",
                        backdropFilter: "blur(20px)",
                        borderBottom: `1px solid ${t.borderPrimary}`, padding: "16px 24px",
                        display: "flex", flexDirection: "column", gap: "4px",
                    }}
                >
                    <MobileLink href="/" label="Home" pathname={pathname} t={t} />
                    {!loggedIn && <MobileLink href="/services/vps" label="VPS" pathname={pathname} t={t} />}
                    {!loggedIn && <MobileLink href="/services/email" label="Email" pathname={pathname} t={t} />}
                    {!loggedIn && <MobileLink href="/services/vpn" label="VPN" pathname={pathname} t={t} />}
                    {!loggedIn && <MobileLink href="/services/proxy" label="Proxy" pathname={pathname} t={t} />}
                    <MobileLink href="/blog" label="Blog" pathname={pathname} t={t} />
                    {loggedIn && <MobileLink href="/dashboard/vps" label="Dashboard" pathname={pathname} t={t} />}
                    {loggedIn && <MobileLink href="/settings" label="Settings" pathname={pathname} t={t} />}
                    {loggedIn && <MobileLink href="/dashboard/billing" label="Billing" pathname={pathname} t={t} />}

                    <div style={{ borderTop: `1px solid ${t.borderPrimary}`, margin: "8px 0", paddingTop: "12px", display: "flex", gap: "10px" }}>
                        {loggedIn ? (
                            <button onClick={() => signOut({ callbackUrl: typeof window !== "undefined" ? window.location.origin : "/" })} className="btn btn-ghost" style={{ flex: 1 }}>Sign Out</button>
                        ) : (
                            <>
                                <Link href="/auth/login" className="btn btn-ghost" style={{ flex: 1 }}>Log In</Link>
                                <Link href="/auth/register" className="btn btn-primary" style={{ flex: 1 }}>Sign Up</Link>
                            </>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
}
