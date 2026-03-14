"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const NAV_LINKS = [
    { href: "/", label: "Home" },
    { href: "/services/vps", label: "VPS" },
    { href: "/services/email", label: "Email" },
    { href: "/services/vpn", label: "VPN" },
    { href: "/services/proxy", label: "Proxy" },
    { href: "/blog", label: "Blog" },
    { href: "/dashboard", label: "Dashboard" },
];

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const pathname = usePathname();
    const { data: session, status } = useSession();
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        setMobileOpen(false);
        setUserMenuOpen(false);
    }, [pathname]);

    // Close user menu on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setUserMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const displayName = session?.user?.name || session?.user?.email?.split("@")[0] || "User";
    const initials = displayName.slice(0, 2).toUpperCase();
    const isLoggedIn = status === "authenticated";

    return (
        <nav
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1000,
                padding: scrolled ? "12px 0" : "20px 0",
                background: scrolled
                    ? "rgba(10, 10, 15, 0.85)"
                    : "transparent",
                backdropFilter: scrolled ? "blur(20px)" : "none",
                borderBottom: scrolled
                    ? "1px solid rgba(255,255,255,0.06)"
                    : "none",
                transition: "all 0.3s ease",
            }}
        >
            <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {/* Logo */}
                <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
                    <Image
                        src="/nrsp-icon.png"
                        alt="NRSP"
                        width={32}
                        height={32}
                        style={{ objectFit: "contain", borderRadius: "6px" }}
                        priority
                    />
                    <span
                        style={{
                            fontWeight: 700,
                            fontSize: "1.15rem",
                            color: "var(--text-primary)",
                            letterSpacing: "-0.02em",
                        }}
                    >
                        Notrespond<span style={{ color: "var(--accent-cyan)" }}>.com</span>
                    </span>
                </Link>

                {/* Desktop Nav */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }} className="nav-desktop">
                    {NAV_LINKS.map((link) => {
                        const isActive =
                            link.href === "/"
                                ? pathname === "/"
                                : pathname.startsWith(link.href);

                        return (
                            <Link
                                key={link.href}
                                href={link.href}
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
                                {link.label}
                            </Link>
                        );
                    })}
                </div>

                {/* Auth Section */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }} className="nav-auth">
                    {isLoggedIn ? (
                        <div ref={menuRef} style={{ position: "relative" }}>
                            <button
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    background: "rgba(255,255,255,0.06)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: "12px",
                                    padding: "6px 14px 6px 6px",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                    color: "var(--text-primary)",
                                }}
                            >
                                {/* Avatar */}
                                <div style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: "8px",
                                    background: "var(--gradient-primary)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "0.7rem",
                                    fontWeight: 700,
                                    color: "#fff",
                                    letterSpacing: "0.5px",
                                }}>
                                    {initials}
                                </div>
                                <span style={{ fontSize: "0.85rem", fontWeight: 500, maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {displayName}
                                </span>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: userMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                                    <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>

                            {/* User Dropdown */}
                            {userMenuOpen && (
                                <div style={{
                                    position: "absolute",
                                    top: "calc(100% + 8px)",
                                    right: 0,
                                    minWidth: "200px",
                                    background: "rgba(15, 15, 20, 0.98)",
                                    backdropFilter: "blur(20px)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: "12px",
                                    padding: "8px",
                                    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                                    zIndex: 1001,
                                }}>
                                    <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: "4px" }}>
                                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>{displayName}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>{session?.user?.email}</div>
                                    </div>
                                    <Link href="/dashboard" style={{
                                        display: "block", padding: "10px 12px", borderRadius: "8px", fontSize: "0.85rem",
                                        color: "var(--text-secondary)", textDecoration: "none",
                                    }}>
                                        📊 Dashboard
                                    </Link>
                                    <Link href="/dashboard/vps" style={{
                                        display: "block", padding: "10px 12px", borderRadius: "8px", fontSize: "0.85rem",
                                        color: "var(--text-secondary)", textDecoration: "none",
                                    }}>
                                        🖥️ My VPS
                                    </Link>
                                    {(session?.user as any)?.role === "ADMIN" && (
                                        <Link href="/admin" style={{
                                            display: "block", padding: "10px 12px", borderRadius: "8px", fontSize: "0.85rem",
                                            color: "var(--accent-magenta)", textDecoration: "none",
                                        }}>
                                            ⚙️ Admin Panel
                                        </Link>
                                    )}
                                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "4px", paddingTop: "4px" }}>
                                        <button
                                            onClick={() => signOut({ callbackUrl: window.location.origin })}
                                            style={{
                                                display: "block", width: "100%", padding: "10px 12px", borderRadius: "8px", fontSize: "0.85rem",
                                                color: "var(--accent-magenta)", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                                            }}
                                        >
                                            🚪 Log Out
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <Link href="/auth/login" className="btn btn-ghost" style={{ padding: "8px 20px", fontSize: "0.85rem" }}>
                                Log In
                            </Link>
                            <Link href="/auth/register" className="btn btn-primary" style={{ padding: "8px 20px", fontSize: "0.85rem" }}>
                                Sign Up
                            </Link>
                        </>
                    )}
                </div>

                {/* Mobile Menu Button */}
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="nav-mobile-btn"
                    style={{
                        display: "none",
                        background: "none",
                        border: "none",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        padding: 8,
                    }}
                    aria-label="Toggle menu"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {mobileOpen ? (
                            <path d="M6 6l12 12M6 18L18 6" />
                        ) : (
                            <path d="M3 12h18M3 6h18M3 18h18" />
                        )}
                    </svg>
                </button>
            </div>

            {/* Mobile Dropdown */}
            {mobileOpen && (
                <div
                    className="nav-mobile-menu"
                    style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        background: "rgba(10, 10, 15, 0.95)",
                        backdropFilter: "blur(20px)",
                        borderBottom: "1px solid var(--glass-border)",
                        padding: "16px 24px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                    }}
                >
                    {NAV_LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            style={{
                                padding: "12px 16px",
                                borderRadius: "8px",
                                color: pathname === link.href ? "var(--accent-cyan)" : "var(--text-secondary)",
                                textDecoration: "none",
                                fontSize: "0.95rem",
                            }}
                        >
                            {link.label}
                        </Link>
                    ))}
                    <div style={{ borderTop: "1px solid var(--glass-border)", margin: "8px 0", paddingTop: "12px", display: "flex", gap: "10px" }}>
                        {isLoggedIn ? (
                            <>
                                <span style={{ flex: 1, textAlign: "center", color: "var(--text-primary)", fontSize: "0.9rem", padding: "8px", fontWeight: 500 }}>
                                    {displayName}
                                </span>
                                <button
                                    onClick={() => signOut({ callbackUrl: window.location.origin })}
                                    className="btn btn-ghost"
                                    style={{ flex: 1 }}
                                >
                                    Log Out
                                </button>
                            </>
                        ) : (
                            <>
                                <Link href="/auth/login" className="btn btn-ghost" style={{ flex: 1 }}>
                                    Log In
                                </Link>
                                <Link href="/auth/register" className="btn btn-primary" style={{ flex: 1 }}>
                                    Sign Up
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            )}

        </nav>
    );
}
