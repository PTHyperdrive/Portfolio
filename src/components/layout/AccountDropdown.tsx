"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Settings, LogOut, ChevronDown } from "lucide-react";

/**
 * AccountDropdown
 *
 * Renders the user's avatar + name in the Console header.
 * Click to open a dropdown with Account Settings + Logout.
 */
export default function AccountDropdown() {
    const { data: session } = useSession();
    const t = useThemeTokens();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    if (!session?.user) return null;

    const userName = session.user.name || session.user.email?.split("@")[0] || "User";
    const initial = (session.user.name || session.user.email || "U")[0].toUpperCase();

    return (
        <div ref={ref} style={{ position: "relative" }}>
            {/* ── Trigger ── */}
            <button
                id="account-dropdown-trigger"
                onClick={() => setOpen(prev => !prev)}
                style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "6px 14px 6px 6px",
                    borderRadius: t.isMono ? 6 : 10,
                    border: `1px solid ${t.borderPrimary}`,
                    background: open ? t.bgCardHover : "transparent",
                    cursor: "pointer",
                    transition: "all 0.15s",
                }}
            >
                {/* Avatar */}
                <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: t.isMono ? t.bgTertiary : "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                    border: t.isMono ? `1px solid ${t.borderPrimary}` : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.82rem", fontWeight: 800,
                    color: t.isLight ? t.textPrimary : "#fff",
                }}>
                    {initial}
                </div>
                <span style={{
                    fontSize: "0.85rem", fontWeight: 600, color: t.textPrimary,
                    maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}>
                    {userName}
                </span>
                <ChevronDown style={{
                    width: 14, height: 14, color: t.textMuted,
                    transition: "transform 0.2s",
                    transform: open ? "rotate(180deg)" : "rotate(0deg)",
                }} />
            </button>

            {/* ── Dropdown Menu ── */}
            {open && (
                <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0,
                    minWidth: 200, zIndex: 100,
                    background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
                    borderRadius: t.cardRadius, boxShadow: t.shadow,
                    padding: "6px 0",
                    animation: "fadeIn 0.12s ease-out",
                }}>
                    {/* User info header */}
                    <div style={{
                        padding: "12px 16px", borderBottom: `1px solid ${t.borderSecondary}`,
                    }}>
                        <p style={{
                            fontSize: "0.85rem", fontWeight: 700, color: t.textPrimary,
                            marginBottom: 2,
                        }}>
                            {session.user.name || "User"}
                        </p>
                        <p style={{ fontSize: "0.72rem", color: t.textMuted }}>
                            {session.user.email}
                        </p>
                    </div>

                    {/* Account Settings */}
                    <Link
                        href="/account-settings"
                        id="account-settings-link"
                        onClick={() => setOpen(false)}
                        style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "10px 16px",
                            textDecoration: "none", color: t.textSecondary,
                            fontSize: "0.85rem", fontWeight: 600,
                            transition: "all 0.1s",
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = t.bgCardHover;
                            e.currentTarget.style.color = t.textPrimary;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = t.textSecondary;
                        }}
                    >
                        <Settings style={{ width: 15, height: 15 }} />
                        Account Settings
                    </Link>

                    {/* Divider */}
                    <div style={{ height: 1, background: t.borderSecondary, margin: "4px 0" }} />

                    {/* Logout */}
                    <button
                        id="account-logout-btn"
                        onClick={() => signOut({ callbackUrl: "/" })}
                        style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "10px 16px", width: "100%",
                            border: "none", background: "transparent",
                            textAlign: "left", cursor: "pointer",
                            color: t.statusError,
                            fontSize: "0.85rem", fontWeight: 600,
                            transition: "all 0.1s",
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = t.statusErrorBg;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = "transparent";
                        }}
                    >
                        <LogOut style={{ width: 15, height: 15 }} />
                        Log out
                    </button>
                </div>
            )}

            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
    );
}
