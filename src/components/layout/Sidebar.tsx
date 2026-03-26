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

type NavGroup = {
    title: string;
    items: NavItem[];
};

const SIDEBAR_STRUCTURE: NavGroup[] = [
    {
        title: "PUBLIC CLOUD",
        items: [
            {
                label: "Compute", icon: Server, href: "/dashboard/vps", subItems: [
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

    const toggleExpand = (label: string) => {
        setExpanded(prev => ({ ...prev, [label]: !prev[label] }));
    };

    const linkBase = "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150";
    const linkActive = "bg-blue-600/20 text-blue-400 font-semibold";
    const linkInactive = "text-slate-400 hover:text-slate-100 hover:bg-slate-800";

    return (
        <aside
            className="w-[260px] flex flex-col h-full flex-shrink-0 border-r border-slate-800"
            style={{ backgroundColor: "#0f1117" }}
        >
            {/* ── Brand Logo ── */}
            <div className="flex items-center gap-3 px-5 h-[64px] border-b border-slate-800 flex-shrink-0">
                <Link href="/" className="flex items-center gap-3" style={{ textDecoration: "none" }}>
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <Image
                            src="/logo.png"
                            alt="Logo"
                            width={18}
                            height={18}
                            style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
                        />
                    </div>
                    <span className="font-extrabold text-white text-base tracking-tight">
                        Not<span className="text-blue-400">Respond</span>
                    </span>
                </Link>
            </div>

            {/* ── Scrollable Nav ── */}
            <div
                className="flex-1 overflow-y-auto px-3 py-4 space-y-6"
                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}
            >
                {/* Overview top link */}
                <Link
                    href="/dashboard/vps"
                    className={`${linkBase} ${pathname === "/dashboard/vps" && !pathname.startsWith("/dashboard/vps/") ? linkActive : linkInactive}`}
                    style={{ textDecoration: "none" }}
                >
                    <LayoutGrid className="w-4 h-4 flex-shrink-0" />
                    Overview
                </Link>

                {/* Sections */}
                {SIDEBAR_STRUCTURE.map((group) => (
                    <div key={group.title}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-3">
                            {group.title}
                        </p>
                        <div className="flex flex-col space-y-0.5">
                            {group.items.map((item) => {
                                const isActive = pathname.startsWith(item.href);
                                const isExpanded = !!expanded[item.label];
                                const hasSubItems = !!item.subItems;

                                return (
                                    <div key={item.label}>
                                        {hasSubItems ? (
                                            <button
                                                onClick={() => toggleExpand(item.label)}
                                                className={`w-full ${linkBase} justify-between ${isActive ? linkActive : linkInactive}`}
                                            >
                                                <span className="flex items-center gap-3">
                                                    <item.icon className="w-4 h-4 flex-shrink-0" />
                                                    {item.label}
                                                </span>
                                                {isExpanded
                                                    ? <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                                                    : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                                                }
                                            </button>
                                        ) : (
                                            <Link
                                                href={item.href}
                                                className={`${linkBase} justify-between ${isActive ? linkActive : linkInactive}`}
                                                style={{ textDecoration: "none" }}
                                            >
                                                <span className="flex items-center gap-3">
                                                    <item.icon className="w-4 h-4 flex-shrink-0" />
                                                    {item.label}
                                                </span>
                                                {item.hasArrow && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
                                            </Link>
                                        )}

                                        {/* Expanded sub-items */}
                                        {hasSubItems && isExpanded && (
                                            <div className="ml-4 mt-0.5 mb-1 border-l border-slate-700/60 pl-3 flex flex-col space-y-0.5">
                                                {item.subItems!.map((sub) => {
                                                    const subActive = pathname === sub.href;
                                                    return (
                                                        <Link
                                                            key={sub.label}
                                                            href={sub.href}
                                                            className={`block px-3 py-1.5 text-[0.82rem] rounded-md transition-all duration-150 ${subActive ? "text-slate-100 font-semibold" : "text-slate-500 hover:text-slate-300"}`}
                                                            style={{ textDecoration: "none" }}
                                                        >
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

            {/* ── User Profile — always anchored to bottom ── */}
            <div className="flex-shrink-0 border-t border-slate-800 p-4">
                <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {(session?.user?.name || session?.user?.email || "U")[0].toUpperCase()}
                    </div>
                    {/* Name + email */}
                    <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-semibold text-slate-200 truncate leading-tight">
                            {session?.user?.name || session?.user?.email?.split("@")[0] || "Guest"}
                        </p>
                        <p className="text-[0.72rem] text-slate-500 truncate leading-tight">
                            {session?.user?.email || "Not signed in"}
                        </p>
                    </div>
                    {/* Logout icon */}
                    <button
                        onClick={() => signOut({ callbackUrl: "/" })}
                        title="Log out"
                        className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors flex-shrink-0"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
