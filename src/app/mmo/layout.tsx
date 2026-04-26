"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useCredits } from "@/components/CreditProvider";
import ThemeToggle from "@/components/ThemeToggle";
import {
    ShoppingBag, SlidersHorizontal, Tag, ArrowLeft, ChevronDown,
    LogOut, Shield, LayoutGrid, User, Home, Wallet, Layers
} from "lucide-react";

type CategoryMeta = {
    id: string;
    name: string;
    slug: string;
    availableStock: number;
};

export default function MmoLayout({ children }: { children: React.ReactNode }) {
    const t = useThemeTokens();
    const pathname = usePathname();
    const { data: session } = useSession();
    const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";
    const { credits: globalCredits } = useCredits();

    /* ─── Filter Sidebar State ─── */
    const [sortBy, setSortBy] = useState("default");
    const [priceMin, setPriceMin] = useState(0);
    const [priceMax, setPriceMax] = useState(10000);
    const [stockFilter, setStockFilter] = useState("all");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [categories, setCategories] = useState<CategoryMeta[]>([]);

    // Fetch categories for sidebar filter
    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch("/api/mmo");
            if (res.ok) {
                const data = await res.json();
                setCategories(data.map((c: { id: string; name: string; slug: string; availableStock: number }) => ({
                    id: c.id, name: c.name, slug: c.slug, availableStock: c.availableStock,
                })));
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => { fetchCategories(); }, [fetchCategories]);

    const SORT_OPTIONS = [
        { value: "default", label: "Default" },
        { value: "price-asc", label: "Price: Low to High" },
        { value: "price-desc", label: "Price: High to Low" },
        { value: "name-asc", label: "Name: A — Z" },
        { value: "stock-desc", label: "Most Stock" },
    ];

    const STOCK_FILTERS = [
        { value: "all", label: "All Items" },
        { value: "in-stock", label: "In Stock Only" },
    ];

    /* ─── Styles ─── */
    const sidebarWidth = 300; // wider than VPS sidebar (260px)

    const labelStyle: React.CSSProperties = {
        fontSize: "0.68rem", fontWeight: 700, color: t.textMuted,
        textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: 8, display: "flex", alignItems: "center", gap: 5,
    };

    const sectionStyle: React.CSSProperties = {
        padding: "0 20px", marginBottom: 22,
    };

    const filterBtn = (active: boolean): React.CSSProperties => ({
        padding: "7px 12px", borderRadius: t.buttonRadius, width: "100%",
        border: `1px solid ${active ? t.accentPrimary + "55" : "transparent"}`,
        background: active ? t.accentPrimaryMuted : "transparent",
        color: active ? t.accentPrimary : t.textSecondary,
        fontSize: "0.78rem", fontWeight: active ? 700 : 500,
        cursor: "pointer", textAlign: "left" as const,
        transition: "all 0.12s", display: "flex", alignItems: "center", justifyContent: "space-between",
    });

    return (
        <div style={{
            display: "flex", height: "100vh", width: "100%", overflow: "hidden",
            backgroundColor: t.bgPrimary, color: t.textPrimary, fontFamily: t.fontFamily,
        }}>
            {/* ═══════════════════ SIDEBAR ═══════════════════ */}
            <aside style={{
                width: sidebarWidth, minWidth: sidebarWidth, height: "100vh",
                overflowY: "auto", display: "flex", flexDirection: "column",
                background: t.isMono
                    ? (t.isLight ? "#fafafa" : "#0a0a0a")
                    : "rgba(10,10,15,0.98)",
                borderRight: `1px solid ${t.borderPrimary}`,
            }}>
                {/* ── Brand ── */}
                <div style={{
                    padding: "16px 20px", borderBottom: `1px solid ${t.borderPrimary}`,
                    display: "flex", alignItems: "center", gap: 10,
                }}>
                    <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                        <Image src="/logo.png" alt="Notrespond" width={28} height={28} style={{ objectFit: "contain", width: 28, height: 28 }} />
                        <span style={{ fontWeight: 800, fontSize: "0.95rem", color: t.textPrimary }}>
                            Not<span style={{ color: t.accentPrimary }}>Respond</span>
                        </span>
                    </Link>
                </div>

                {/* ── Navigation ── */}
                <div style={{ padding: "12px 12px 0" }}>
                    {/* Home */}
                    <Link href="/mmo" style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 12px", borderRadius: t.buttonRadius,
                        textDecoration: "none", marginBottom: 4,
                        background: pathname === "/mmo" ? t.accentPrimaryMuted : "transparent",
                        color: pathname === "/mmo" ? t.accentPrimary : t.textSecondary,
                        fontWeight: 600, fontSize: "0.88rem",
                        borderLeft: pathname === "/mmo" ? `3px solid ${t.accentPrimary}` : "3px solid transparent",
                        transition: "all 0.12s",
                    }}>
                        <Home style={{ width: 16, height: 16 }} /> Home
                    </Link>

                    {/* Back to Dashboard */}
                    <Link href="/dashboard/vps" style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 12px", borderRadius: t.buttonRadius,
                        textDecoration: "none", marginBottom: 4,
                        color: t.textMuted, fontWeight: 500, fontSize: "0.85rem",
                        transition: "color 0.12s",
                    }}>
                        <ArrowLeft style={{ width: 14, height: 14 }} /> Dashboard
                    </Link>
                </div>

                {/* ── Account Display ── */}
                {session?.user && (
                    <div style={{
                        margin: "8px 12px 0", padding: "14px 14px",
                        borderRadius: t.buttonRadius,
                        background: t.bgCard, border: `1px solid ${t.borderSecondary}`,
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <div style={{
                                width: 34, height: 34, borderRadius: t.isMono ? 6 : 10,
                                background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}33`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "0.82rem", fontWeight: 800, color: t.accentPrimary,
                            }}>
                                {(session.user.name || session.user.email || "U")[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                    fontSize: "0.82rem", fontWeight: 700, color: t.textPrimary,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>{session.user.name || "User"}</p>
                                <p style={{
                                    fontSize: "0.68rem", color: t.textMuted,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>{session.user.email}</p>
                            </div>
                        </div>
                        <div style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "6px 10px", borderRadius: t.buttonRadius,
                            background: t.bgTertiary, fontSize: "0.75rem",
                        }}>
                            <Wallet style={{ width: 12, height: 12, color: t.statusWarning }} />
                            <span style={{ color: t.textSecondary, fontWeight: 600 }}>Credits: </span>
                            <span style={{ color: t.accentPrimary, fontWeight: 800, fontFamily: t.fontMono }}>
                                {globalCredits.toLocaleString()}
                            </span>
                        </div>
                    </div>
                )}

                {/* ── Divider ── */}
                <div style={{ height: 1, background: t.borderPrimary, margin: "16px 20px 12px" }} />

                {/* ── Type of Products (Categories) ── */}
                <div style={sectionStyle}>
                    <p style={labelStyle}>
                        <Layers style={{ width: 11, height: 11 }} /> Type of Products
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <button onClick={() => setSelectedCategory("all")} style={filterBtn(selectedCategory === "all")}>
                            All Categories
                            <span style={{ fontSize: "0.65rem", color: t.textMuted, fontFamily: t.fontMono }}>
                                {categories.reduce((s, c) => s + c.availableStock, 0)}
                            </span>
                        </button>
                        {categories.map((cat) => (
                            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={filterBtn(selectedCategory === cat.id)}>
                                {cat.name}
                                <span style={{ fontSize: "0.65rem", color: t.textMuted, fontFamily: t.fontMono }}>
                                    {cat.availableStock}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Price Range ── */}
                <div style={sectionStyle}>
                    <p style={labelStyle}>
                        <Tag style={{ width: 11, height: 11 }} /> Price Range
                    </p>
                    <div style={{ padding: "0 4px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                            <span style={{ fontSize: "0.72rem", color: t.textSecondary, fontFamily: t.fontMono }}>{priceMin.toLocaleString()} Cr</span>
                            <span style={{ fontSize: "0.72rem", color: t.textSecondary, fontFamily: t.fontMono }}>{priceMax.toLocaleString()} Cr</span>
                        </div>
                        {/* Min slider */}
                        <label style={{ fontSize: "0.65rem", color: t.textMuted, marginBottom: 3, display: "block" }}>Min</label>
                        <input
                            type="range" min={0} max={10000} step={50} value={priceMin}
                            onChange={(e) => setPriceMin(Math.min(Number(e.target.value), priceMax))}
                            style={{ width: "100%", accentColor: t.accentPrimary, marginBottom: 10 }}
                        />
                        {/* Max slider */}
                        <label style={{ fontSize: "0.65rem", color: t.textMuted, marginBottom: 3, display: "block" }}>Max</label>
                        <input
                            type="range" min={0} max={10000} step={50} value={priceMax}
                            onChange={(e) => setPriceMax(Math.max(Number(e.target.value), priceMin))}
                            style={{ width: "100%", accentColor: t.accentPrimary }}
                        />
                    </div>
                </div>

                {/* ── Sort By ── */}
                <div style={sectionStyle}>
                    <p style={labelStyle}>
                        <SlidersHorizontal style={{ width: 11, height: 11 }} /> Sort By
                    </p>
                    <div style={{ position: "relative" }}>
                        <select
                            value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                            style={{
                                width: "100%", padding: "8px 32px 8px 12px", boxSizing: "border-box",
                                background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
                                borderRadius: t.buttonRadius, color: t.textPrimary,
                                fontSize: "0.82rem", fontFamily: t.fontFamily,
                                appearance: "none", cursor: "pointer", outline: "none",
                            }}
                        >
                            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <ChevronDown style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: t.textMuted, pointerEvents: "none" }} />
                    </div>
                </div>

                {/* ── Availability ── */}
                <div style={sectionStyle}>
                    <p style={labelStyle}>
                        <LayoutGrid style={{ width: 11, height: 11 }} /> Availability
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {STOCK_FILTERS.map((s) => (
                            <button key={s.value} onClick={() => setStockFilter(s.value)} style={filterBtn(stockFilter === s.value)}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Bottom Section ── */}
                <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `1px solid ${t.borderPrimary}` }}>
                    <ThemeToggle variant="sidebar" />

                    {isAdmin && (
                        <Link href="/admin/mmo" style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "8px 12px", marginTop: 8, borderRadius: t.buttonRadius,
                            background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`,
                            textDecoration: "none", color: t.statusWarning,
                            fontSize: "0.78rem", fontWeight: 700,
                        }}>
                            <Shield style={{ width: 13, height: 13 }} /> Admin Inventory
                        </Link>
                    )}

                    {session?.user && (
                        <button
                            onClick={() => signOut({ callbackUrl: "/" })}
                            style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "8px 12px", marginTop: 8, borderRadius: t.buttonRadius,
                                background: "transparent", border: `1px solid ${t.borderPrimary}`,
                                color: t.textMuted, fontSize: "0.78rem", fontWeight: 600,
                                cursor: "pointer", width: "100%",
                            }}
                        >
                            <LogOut style={{ width: 13, height: 13 }} /> Sign Out
                        </button>
                    )}
                </div>
            </aside>

            {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
            <main
                data-mmo-filters={JSON.stringify({
                    sortBy, priceMin, priceMax, stockFilter, selectedCategory,
                })}
                style={{
                    flex: 1, overflowY: "auto", position: "relative",
                    backgroundColor: t.bgPrimary,
                }}
            >
                {children}
            </main>
        </div>
    );
}
