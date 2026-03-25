"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
    const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
        <Link
            href={href}
            style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "0.88rem",
                fontWeight: 500,
                color: isActive ? "var(--accent-cyan)" : "var(--text-secondary)",
                background: isActive ? "rgba(0, 240, 255, 0.08)" : "transparent",
                textDecoration: "none",
                transition: "all 0.2s ease",
            }}
        >
            {label}
        </Link>
    );
}

function MobileLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
    return (
        <Link
            href={href}
            style={{
                padding: "12px 16px",
                borderRadius: "8px",
                color: pathname === href ? "var(--accent-cyan)" : "var(--text-secondary)",
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

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Removed useEffect for pathname change, instead we rely on mobileOpen conditionally

    // ── While session is loading, render a skeleton to prevent flash ──
    if (status === "loading") {
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
                        <span style={{ fontWeight: 700, fontSize: "1.15rem", color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                            Notrespond<span style={{ color: "var(--accent-cyan)" }}>.com</span>
                        </span>
                    </Link>
                    <div style={{ display: "flex", gap: "8px" }}>
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} style={{ width: 60, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.04)" }} />
                        ))}
                    </div>
                </div>
            </nav>
        );
    }

    const loggedIn = !!session;

    return (
        <nav
            style={{
                position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
                padding: scrolled ? "12px 0" : "20px 0",
                background: scrolled ? "rgba(10, 10, 15, 0.85)" : "transparent",
                backdropFilter: scrolled ? "blur(20px)" : "none",
                borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
                transition: "all 0.3s ease",
            }}
        >
            <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {/* Logo */}
                <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
                    <Image src="/logo.png" alt="Notrespond.com" width={140} height={36} style={{ objectFit: "contain", width: "auto", height: "36px" }} priority />
                    <span style={{ fontWeight: 700, fontSize: "1.15rem", color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                        Notrespond<span style={{ color: "var(--accent-cyan)" }}>.com</span>
                    </span>
                </Link>

                {/* ═══════════════════════════════════════════════════
                    DESKTOP LINKS — explicit conditional, no arrays
                   ═══════════════════════════════════════════════════ */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }} className="nav-desktop">
                    {/* Always visible */}
                    <NavLink href="/" label="Home" pathname={pathname} />

                    {/* Public-only: service marketing pages */}
                    {!loggedIn && <NavLink href="/services/vps" label="VPS" pathname={pathname} />}
                    {!loggedIn && <NavLink href="/services/email" label="Email" pathname={pathname} />}
                    {!loggedIn && <NavLink href="/services/vpn" label="VPN" pathname={pathname} />}
                    {!loggedIn && <NavLink href="/services/proxy" label="Proxy" pathname={pathname} />}

                    {/* Always visible */}
                    <NavLink href="/blog" label="Blog" pathname={pathname} />

                    {/* Authenticated-only */}
                    {loggedIn && <NavLink href="/dashboard/vps" label="Dashboard" pathname={pathname} />}
                    {loggedIn && <NavLink href="/settings" label="Settings" pathname={pathname} />}
                    {loggedIn && <NavLink href="/payment" label="Payment" pathname={pathname} />}
                </div>

                {/* Auth Area */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }} className="nav-auth">
                    {loggedIn ? (
                        <>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: "10px",
                                    background: "var(--gradient-primary)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontWeight: 700, fontSize: "0.8rem", color: "#fff",
                                }}>
                                    {(session.user?.name || session.user?.email || "U")[0].toUpperCase()}
                                </div>
                                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {session.user?.name || session.user?.email}
                                </span>
                            </div>
                            <button onClick={() => signOut({ callbackUrl: "/" })} className="btn btn-ghost" style={{ padding: "7px 16px", fontSize: "0.82rem" }}>
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
                    style={{ display: "none", background: "none", border: "none", color: "var(--text-primary)", cursor: "pointer", padding: 8 }}
                    aria-label="Toggle menu"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {mobileOpen ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
                    </svg>
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════
                MOBILE DROPDOWN — same explicit conditional
               ═══════════════════════════════════════════════════ */}
            {mobileOpen && (
                <div
                    className="nav-mobile-menu"
                    style={{
                        position: "absolute", top: "100%", left: 0, right: 0,
                        background: "rgba(10, 10, 15, 0.95)", backdropFilter: "blur(20px)",
                        borderBottom: "1px solid var(--glass-border)", padding: "16px 24px",
                        display: "flex", flexDirection: "column", gap: "4px",
                    }}
                >
                    <MobileLink href="/" label="Home" pathname={pathname} />

                    {!loggedIn && <MobileLink href="/services/vps" label="VPS" pathname={pathname} />}
                    {!loggedIn && <MobileLink href="/services/email" label="Email" pathname={pathname} />}
                    {!loggedIn && <MobileLink href="/services/vpn" label="VPN" pathname={pathname} />}
                    {!loggedIn && <MobileLink href="/services/proxy" label="Proxy" pathname={pathname} />}

                    <MobileLink href="/blog" label="Blog" pathname={pathname} />

                    {loggedIn && <MobileLink href="/dashboard/vps" label="Dashboard" pathname={pathname} />}
                    {loggedIn && <MobileLink href="/settings" label="Settings" pathname={pathname} />}
                    {loggedIn && <MobileLink href="/payment" label="Payment" pathname={pathname} />}

                    <div style={{ borderTop: "1px solid var(--glass-border)", margin: "8px 0", paddingTop: "12px", display: "flex", gap: "10px" }}>
                        {loggedIn ? (
                            <button onClick={() => signOut({ callbackUrl: "/" })} className="btn btn-ghost" style={{ flex: 1 }}>Sign Out</button>
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
