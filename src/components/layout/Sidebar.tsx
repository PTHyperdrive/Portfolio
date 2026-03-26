"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const SIDEBAR_GROUPS = [
    {
        title: "PUBLIC CLOUD",
        links: [
            { href: "/dashboard/vps", label: "Compute", icon: "💻" },
            { href: "/dashboard/storage", label: "Storage", icon: "💾" },
            { href: "/dashboard/networks", label: "Networks", icon: "🌐" },
        ],
    },
    {
        title: "ACCOUNT",
        links: [
            { href: "/settings", label: "Settings", icon: "⚙️" },
            { href: "/dashboard/billing", label: "Billing", icon: "💳" },
        ],
    },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();

    return (
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full flex-shrink-0" style={{ zIndex: 100 }}>
            {/* Header/Logo */}
            <div className="h-16 flex items-center px-6 border-b border-slate-800 mt-2 mb-4">
                <Link href="/" className="flex items-center gap-2 decoration-transparent">
                    <Image src="/logo.png" alt="Logo" width={32} height={32} style={{ objectFit: "contain" }} />
                    <span className="font-bold text-white text-lg tracking-tight">
                        Hyper<span className="text-cyan-400">Core</span>
                    </span>
                </Link>
            </div>

            {/* Navigation Lists */}
            <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-6">
                {SIDEBAR_GROUPS.map((group) => (
                    <div key={group.title}>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                            {group.title}
                        </h4>
                        <ul className="flex flex-col gap-1">
                            {group.links.map((link) => {
                                const isActive = pathname.startsWith(link.href);
                                return (
                                    <li key={link.href}>
                                        <Link
                                            href={link.href}
                                            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                                                isActive
                                                    ? "bg-slate-800 text-cyan-400 font-medium"
                                                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                            }`}
                                            style={{ textDecoration: "none" }}
                                        >
                                            <span style={{ fontSize: "1.1rem" }}>{link.icon}</span>
                                            {link.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>

            {/* User Profile Footer */}
            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center gap-3 mb-4 px-2">
                    <div className="w-8 h-8 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                        {(session?.user?.name || session?.user?.email || "U")[0].toUpperCase()}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-medium text-slate-200 truncate">
                            {session?.user?.name || session?.user?.email || "Guest"}
                        </span>
                        <span className="text-xs text-slate-500 truncate">
                            Member
                        </span>
                    </div>
                </div>
                <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="w-full py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                >
                    Sign Out
                </button>
            </div>
        </aside>
    );
}
