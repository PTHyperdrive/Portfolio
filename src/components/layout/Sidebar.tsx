"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
    LayoutGrid, Server, Gamepad2, Cloud, Key, Globe, Settings as CpuIcon,
    Users, History, BarChart2, Wallet, User, Sliders, MessageSquare, ChevronDown, ChevronRight
} from "lucide-react";

const SIDEBAR_STRUCTURE = [
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
            { label: "Orchestration", icon: CpuIcon, href: "/dashboard/orchestration", hasArrow: true },
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
    
    // Manage expanded state for accordion items, defaulting 'Compute' to open if on a related path
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ "Compute": true });

    const toggleExpand = (label: string) => {
        setExpanded(prev => ({ ...prev, [label]: !prev[label] }));
    };

    return (
        <aside className="w-[280px] flex flex-col h-full flex-shrink-0 border-r"
            style={{ backgroundColor: "#151b23", borderColor: "rgba(255,255,255,0.05)", zIndex: 100 }}>

            {/* Header/Brand Area */}
            <div className="h-16 flex items-center px-6 border-b mt-2 mb-2" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <Link href="/" className="flex items-center gap-3 decoration-transparent">
                    <div style={{
                        width: "32px", height: "32px", borderRadius: "8px", background: "var(--gradient-primary)",
                        display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                        <Image src="/logo.png" alt="Logo" width={20} height={20} style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} />
                    </div>
                    <span className="font-extrabold text-white text-[1.1rem] tracking-tight">
                        HYPER<span className="text-cyan-400">CORE</span>
                    </span>
                </Link>
            </div>

            {/* Scrollable Navigation */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 flex flex-col gap-6"
                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>

                {/* Top Level Item */}
                <Link href="/dashboard"
                    className={`flex items-center gap-4 px-3 py-2.5 rounded-lg text-[0.95rem] font-medium transition-colors ${pathname === "/dashboard" ? "bg-[#1e293b] text-blue-400" : "text-slate-400 hover:text-slate-200"}`}
                    style={{ textDecoration: "none" }}>
                    <LayoutGrid className="w-[1.2rem] h-[1.2rem]" />
                    Overview
                </Link>

                {/* Dynamic Groups */}
                {SIDEBAR_STRUCTURE.map((group) => (
                    <div key={group.title}>
                        <h4 className="text-[0.75rem] font-bold text-slate-500 uppercase tracking-widest mb-3 px-3">
                            {group.title}
                        </h4>
                        <ul className="flex flex-col gap-1">
                            {group.items.map((item) => {
                                const isItemActive = pathname.startsWith(item.href);
                                const isExpanded = !!expanded[item.label];
                                const hasSubItems = !!item.subItems;

                                return (
                                    <li key={item.label}>
                                        {hasSubItems ? (
                                            <button
                                                onClick={() => toggleExpand(item.label)}
                                                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-[0.95rem] font-semibold transition-colors ${isItemActive ? "bg-[#1e293b] text-blue-400" : "text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]/50"}`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <item.icon className="w-[1.2rem] h-[1.2rem]" />
                                                    {item.label}
                                                </div>
                                                {isExpanded ? <ChevronDown className="w-4 h-4 opacity-70" /> : <ChevronRight className="w-4 h-4 opacity-70" />}
                                            </button>
                                        ) : (
                                            <Link
                                                href={item.href}
                                                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-[0.95rem] font-semibold transition-colors ${isItemActive ? "bg-[#1e293b] text-blue-400" : "text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]/50"}`}
                                                style={{ textDecoration: "none" }}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <item.icon className="w-[1.2rem] h-[1.2rem]" />
                                                    {item.label}
                                                </div>
                                                {item.hasArrow && <ChevronRight className="w-4 h-4 opacity-70" />}
                                            </Link>
                                        )}

                                        {/* Sub-items Render */}
                                        {hasSubItems && isExpanded && (
                                            <ul className="flex flex-col mt-1 mb-2 ml-[1.6rem] border-l border-slate-700/50 pl-2">
                                                {item.subItems!.map((sub) => {
                                                    const subActive = pathname === sub.href;
                                                    return (
                                                        <li key={sub.label}>
                                                            <Link
                                                                href={sub.href}
                                                                className={`block px-4 py-2 text-[0.88rem] tracking-wide rounded-md transition-colors ${subActive ? "text-slate-200 font-semibold bg-[#1e293b]/50" : "text-slate-500 font-medium hover:text-slate-300"}`}
                                                                style={{ textDecoration: "none" }}
                                                            >
                                                                <span className="mr-2 opacity-50">•</span> {sub.label}
                                                            </Link>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>

            {/* Profile Footer Area */}
            <div className="p-4 border-t flex flex-col gap-3" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-3 px-2">
                    <div className="w-9 h-9 flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-purple-900/20">
                        {(session?.user?.name || session?.user?.email || "U")[0].toUpperCase()}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-[0.9rem] font-bold text-slate-200 truncate leading-snug">
                            {session?.user?.name || session?.user?.email?.split("@")[0] || "Guest"}
                        </span>
                        <span className="text-[0.75rem] font-medium text-slate-500 truncate">
                            {session?.user?.email || "Not signed in"}
                        </span>
                    </div>
                </div>
                <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="w-full mt-2 py-2 text-[0.85rem] font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors border border-transparent hover:border-slate-700"
                >
                    Log Out
                </button>
            </div>
        </aside>
    );
}
