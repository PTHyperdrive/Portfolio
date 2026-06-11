"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import SessionGuard from "@/components/SessionGuard";
import { useThemeTokens } from "@/lib/useThemeTokens";

/** Track whether the viewport is mobile-width (drawer mode). */
function useIsMobile(breakpoint = 768) {
    // Lazy init reads the real width on the first client render (SSR → false).
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== "undefined" && window.innerWidth <= breakpoint,
    );
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= breakpoint);
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, [breakpoint]);
    return isMobile;
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const t = useThemeTokens();
    const pathname = usePathname();
    const isMobile = useIsMobile();
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Close the drawer whenever the route changes.
    useEffect(() => { setDrawerOpen(false); }, [pathname]);

    // The Console Hub (/dashboard exact) renders full-width with no sidebar.
    const isConsoleHub = pathname === "/dashboard";

    if (isConsoleHub) {
        return (
            <div style={{
                minHeight: "100dvh",
                backgroundColor: t.bgPrimary,
                color: t.textPrimary,
                fontFamily: t.fontFamily,
            }}>
                <SessionGuard />
                {children}
            </div>
        );
    }

    // ── Mobile: off-canvas drawer + hamburger bar ───────────────────
    if (isMobile) {
        return (
            <div style={{
                minHeight: "100dvh",
                backgroundColor: t.bgPrimary,
                color: t.textPrimary,
                fontFamily: t.fontFamily,
            }}>
                <SessionGuard />

                {/* Top bar */}
                <header style={{
                    position: "sticky", top: 0, zIndex: 40,
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px",
                    background: t.bgSecondary,
                    borderBottom: `1px solid ${t.borderPrimary}`,
                }}>
                    <button
                        onClick={() => setDrawerOpen(true)}
                        aria-label="Open menu"
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 38, height: 38, borderRadius: t.isMono ? 0 : 8,
                            border: `1px solid ${t.borderPrimary}`, background: "transparent",
                            color: t.textPrimary, cursor: "pointer",
                        }}
                    >
                        <Menu style={{ width: 20, height: 20 }} />
                    </button>
                    <span style={{ fontWeight: 800, letterSpacing: "-0.02em", fontSize: "1rem" }}>
                        NotRespond
                    </span>
                </header>

                {/* Backdrop */}
                {drawerOpen && (
                    <div
                        onClick={() => setDrawerOpen(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 49, background: "rgba(0,0,0,0.55)" }}
                    />
                )}

                {/* Drawer */}
                <div style={{
                    position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50,
                    width: 264, maxWidth: "82vw",
                    transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
                    transition: "transform 0.2s ease",
                    boxShadow: drawerOpen ? "2px 0 16px rgba(0,0,0,0.4)" : "none",
                }}>
                    <button
                        onClick={() => setDrawerOpen(false)}
                        aria-label="Close menu"
                        style={{
                            position: "absolute", top: 10, right: 10, zIndex: 51,
                            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                            border: "none", background: "transparent", color: t.textMuted, cursor: "pointer",
                        }}
                    >
                        <X style={{ width: 18, height: 18 }} />
                    </button>
                    <Sidebar />
                </div>

                <main style={{ minHeight: "calc(100dvh - 59px)", backgroundColor: t.bgPrimary }}>
                    {children}
                </main>
            </div>
        );
    }

    // ── Desktop: static sidebar + scrollable main ───────────────────
    return (
        <div style={{
            display: "flex",
            height: "100dvh",
            width: "100%",
            overflow: "hidden",
            backgroundColor: t.bgPrimary,
            color: t.textPrimary,
            fontFamily: t.fontFamily,
        }}>
            <SessionGuard />
            <Sidebar />
            <main style={{
                flex: 1,
                overflowY: "auto",
                position: "relative",
                backgroundColor: t.bgPrimary,
            }}>
                {children}
            </main>
        </div>
    );
}
