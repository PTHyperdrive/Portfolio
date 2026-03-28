"use client";

import Sidebar from "@/components/layout/Sidebar";
import SessionGuard from "@/components/SessionGuard";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-200" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
            <SessionGuard />
            <Sidebar />
            <main className="flex-1 overflow-y-auto relative" style={{ backgroundColor: "#0d1117" }}>
                {children}
            </main>
        </div>
    );
}
