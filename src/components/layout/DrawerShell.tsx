"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useIsMobile } from "@/lib/useIsMobile";

/**
 * Responsive shell for sections that own a fixed sidebar (mmo, sms, admin,
 * docs). Desktop: the sidebar sits beside a scrollable main. Mobile: the
 * sidebar becomes an off-canvas drawer behind a hamburger top bar, so it stops
 * eating the viewport. Pass the section's existing `<aside>` as `sidebar`.
 */
export default function DrawerShell({
    sidebar,
    children,
    sidebarWidth = 280,
    title = "NotRespond",
}: {
    sidebar: React.ReactNode;
    children: React.ReactNode;
    sidebarWidth?: number;
    title?: React.ReactNode;
}) {
    const t = useThemeTokens();
    const isMobile = useIsMobile();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    // Close the drawer on navigation.
    useEffect(() => { setOpen(false); }, [pathname]);

    if (!isMobile) {
        return (
            <div style={{
                display: "flex", height: "100vh", width: "100%", overflow: "hidden",
                backgroundColor: t.bgPrimary, color: t.textPrimary, fontFamily: t.fontFamily,
            }}>
                {sidebar}
                <main style={{ flex: 1, overflowY: "auto", position: "relative", backgroundColor: t.bgPrimary }}>
                    {children}
                </main>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: "100dvh", backgroundColor: t.bgPrimary,
            color: t.textPrimary, fontFamily: t.fontFamily,
        }}>
            {/* Top bar */}
            <header style={{
                position: "sticky", top: 0, zIndex: 40,
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                background: t.bgSecondary, borderBottom: `1px solid ${t.borderPrimary}`,
            }}>
                <button
                    onClick={() => setOpen(true)}
                    aria-label="Open menu"
                    style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 38, height: 38, borderRadius: t.cardRadius,
                        border: `1px solid ${t.borderPrimary}`, background: "transparent",
                        color: t.textPrimary, cursor: "pointer",
                    }}
                >
                    <Menu style={{ width: 20, height: 20 }} />
                </button>
                <span style={{ fontWeight: 800, letterSpacing: "-0.02em", fontSize: "1rem" }}>{title}</span>
            </header>

            {/* Backdrop */}
            {open && (
                <div
                    onClick={() => setOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 49, background: "rgba(0,0,0,0.55)" }}
                />
            )}

            {/* Drawer — wraps the section's own <aside> */}
            <div style={{
                position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50,
                width: sidebarWidth, maxWidth: "85vw",
                transform: open ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.2s ease",
                boxShadow: open ? "2px 0 16px rgba(0,0,0,0.4)" : "none",
            }}>
                <button
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    style={{
                        position: "absolute", top: 10, right: 10, zIndex: 51,
                        width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                        border: "none", background: "transparent", color: t.textMuted, cursor: "pointer",
                    }}
                >
                    <X style={{ width: 18, height: 18 }} />
                </button>
                {sidebar}
            </div>

            <main className="dash-main-mobile" style={{ minHeight: "calc(100dvh - 59px)", backgroundColor: t.bgPrimary }}>
                {children}
            </main>
        </div>
    );
}
