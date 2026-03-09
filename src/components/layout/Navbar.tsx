"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
    { href: "/", label: "Home" },
    { href: "/services/vps", label: "VPS" },
    { href: "/services/email", label: "Email" },
    { href: "/services/vpn", label: "VPN" },
    { href: "/services/proxy", label: "Proxy" },
    { href: "/blog", label: "Blog" },
    { href: "/dashboard/vps", label: "Dashboard" },
];

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

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
                        src="/logo.png"
                        alt="Notrespond.com"
                        width={140}
                        height={36}
                        style={{ objectFit: "contain" }}
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

                {/* Auth Buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }} className="nav-auth">
                    <Link href="/auth/login" className="btn btn-ghost" style={{ padding: "8px 20px", fontSize: "0.85rem" }}>
                        Log In
                    </Link>
                    <Link href="/auth/register" className="btn btn-primary" style={{ padding: "8px 20px", fontSize: "0.85rem" }}>
                        Sign Up
                    </Link>
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
                        <Link href="/auth/login" className="btn btn-ghost" style={{ flex: 1 }}>
                            Log In
                        </Link>
                        <Link href="/auth/register" className="btn btn-primary" style={{ flex: 1 }}>
                            Sign Up
                        </Link>
                    </div>
                </div>
            )}

        </nav>
    );
}
