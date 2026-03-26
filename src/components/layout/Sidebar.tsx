"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
    LayoutGrid, Server, Gamepad2, Cloud, Key, Globe, Settings as SettingsIcon,
    Users, History, BarChart2, Wallet, User, Sliders, MessageSquare,
    ChevronDown, ChevronRight, LogOut
} from "lucide-react";

type SubItem = { label: string; href: string };
type NavItem = {
    label: string;
    icon: React.ElementType;
    href: string;
    subItems?: SubItem[];
    hasArrow?: boolean;
};
type NavGroup = { title: string; items: NavItem[] };

const SIDEBAR_STRUCTURE: NavGroup[] = [
    {
        title: "PUBLIC CLOUD",
        items: [
            {
                label: "Compute", icon: Server, href: "/dashboard/vps",
                subItems: [
                    { label: "Virtual Machine", href: "/dashboard/vps" },
                    { label: "Bare Metal", href: "/dashboard/metal" },
                ]
            },
            { label: "Game Hosting", icon: Gamepad2, href: "/dashboard/game" },
            { label: "Storage", icon: Cloud, href: "/dashboard/storage", hasArrow: true },
            { label: "SSH Keys", icon: Key, href: "/dashboard/ssh" },
            { label: "Networks", icon: Globe, href: "/dashboard/networks", hasArrow: true },
            { label: "Orchestration", icon: SettingsIcon, href: "/dashboard/orchestration", hasArrow: true },
        ],
    },
    {
        title: "TEAM",
        items: [
            { label: "Team Management", icon: Users, href: "/dashboard/team" },
            { label: "Activity Log", icon: History, href: "/dashboard/activity" },
            { label: "Bandwidth Usage", icon: BarChart2, href: "/dashboard/bandwidth", hasArrow: true },
            { label: "Billing", icon: Wallet, href: "/dashboard/billing" },
        ],
    },
    {
        title: "ACCOUNT",
        items: [
            { label: "Settings", icon: User, href: "/dashboard/settings" },
            { label: "Resource Limits", icon: Sliders, href: "/dashboard/limits" },
            { label: "Tickets", icon: MessageSquare, href: "/dashboard/tickets" },
        ],
    },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ "Compute": true });

    const toggle = (label: string) =>
        setExpanded(prev => ({ ...prev, [label]: !prev[label] }));

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

    return (
        <aside
            className="flex flex-col h-full flex-shrink-0"
            style={{ width: "260px", backgroundColor: "#131720", borderRight: "1px solid rgba(255,255,255,0.06)" }}
        >
            {/* ── Brand ── */}
            <div className="flex items-center gap-3 px-5 py-5 flex-shrink-0">
                <Link href="/" className="flex items-center gap-3" style={{ textDecoration: "none" }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: "linear-gradient(135deg,#3b82f6,#6366f1)",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>
                        <Image src="/logo.png" alt="Logo" width={20} height={20}
                            style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "#fff", letterSpacing: "-0.02em" }}>
                        Not<span style={{ color: "#60a5fa" }}>Respond</span>
                    </span>
                </Link>
            </div>

            {/* ── Scrollable Nav ── */}
            <nav
                className="flex-1 overflow-y-auto px-3 pb-4"
                style={{ scrollbarWidth: "none" }}
            >
                {/* Overview */}
                <Link
                    href="/dashboard/vps"
                    style={{ textDecoration: "none" }}
                    className={[
                        "flex items-center gap-3 px-3 py-3 rounded-xl text-[0.92rem] font-semibold mb-5 transition-all",
                        isActive("/dashboard/vps")
                            ? "bg-blue-600/20 text-blue-400"
                            : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                    ].join(" ")}
                >
                    <LayoutGrid className="w-5 h-5 flex-shrink-0" />
                    Overview
                </Link>

                {/* Groups */}
                <div className="flex flex-col gap-7">
                    {SIDEBAR_STRUCTURE.map((group) => (
                        <div key={group.title}>
                            {/* Section label */}
                            <p style={{
                                fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.12em",
                                color: "#475569", textTransform: "uppercase",
                                paddingLeft: "0.75rem", marginBottom: "0.5rem"
                            }}>
                                {group.title}
                            </p>

                            <div className="flex flex-col gap-0.5">
                                {group.items.map((item) => {
                                    const active = isActive(item.href);
                                    const open = !!expanded[item.label];
                                    const hasSub = !!item.subItems;

                                    const rowCls = [
                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[0.9rem] font-semibold transition-all w-full",
                                        active
                                            ? "bg-blue-600/20 text-blue-400"
                                            : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
                                    ].join(" ");

                                    return (
                                        <div key={item.label}>
                                            {hasSub ? (
                                                <button onClick={() => toggle(item.label)} className={rowCls} style={{ justifyContent: "space-between" }}>
                                                    <span className="flex items-center gap-3">
                                                        <item.icon className="w-5 h-5 flex-shrink-0" />
                                                        {item.label}
                                                    </span>
                                                    {open
                                                        ? <ChevronDown className="w-4 h-4 opacity-50" />
                                                        : <ChevronRight className="w-4 h-4 opacity-50" />}
                                                </button>
                                            ) : (
                                                <Link href={item.href} style={{ textDecoration: "none", justifyContent: "space-between", display: "flex" }}
                                                    className={rowCls}>
                                                    <span className="flex items-center gap-3">
                                                        <item.icon className="w-5 h-5 flex-shrink-0" />
                                                        {item.label}
                                                    </span>
                                                    {item.hasArrow && <ChevronRight className="w-4 h-4 opacity-50" />}
                                                </Link>
                                            )}

                                            {/* Sub-items */}
                                            {hasSub && open && (
                                                <div style={{
                                                    marginLeft: "1.25rem",
                                                    marginTop: "0.25rem",
                                                    marginBottom: "0.25rem",
                                                    paddingLeft: "0.875rem",
                                                    borderLeft: "1px solid rgba(100,116,139,0.25)"
                                                }}>
                                                    {item.subItems!.map((sub) => {
                                                        const subActive = pathname === sub.href;
                                                        return (
                                                            <Link key={sub.label} href={sub.href}
                                                                style={{ textDecoration: "none" }}
                                                                className={[
                                                                    "flex items-center gap-2 px-3 py-2.5 text-[0.875rem] font-medium rounded-lg transition-all",
                                                                    subActive
                                                                        ? "text-slate-100 bg-white/5"
                                                                        : "text-slate-500 hover:text-slate-300"
                                                                ].join(" ")}
                                                            >
                                                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: subActive ? "#60a5fa" : "#475569", flexShrink: 0 }} />
                                                                {sub.label}
                                                            </Link>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </nav>

            {/* ── Anchored User Footer ── */}
            <div className="flex-shrink-0 px-4 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-3">
                    <div style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                        background: "linear-gradient(135deg,#8b5cf6,#3b82f6)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.8rem", fontWeight: 700, color: "#fff"
                    }}>
                        {(session?.user?.name || session?.user?.email || "U")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>
                            {session?.user?.name || session?.user?.email?.split("@")[0] || "Guest"}
                        </p>
                        <p style={{ fontSize: "0.7rem", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>
                            {session?.user?.email || "Not signed in"}
                        </p>
                    </div>
                    <button
                        onClick={() => signOut({ callbackUrl: "/" })}
                        title="Log out"
                        style={{ padding: "6px", borderRadius: "8px", color: "#64748b", background: "transparent", border: "none", cursor: "pointer", flexShrink: 0 }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#64748b"; }}
                    >
                        <LogOut style={{ width: 16, height: 16 }} />
                    </button>
                </div>
            </div>
        </aside>
    );
}
