"use client";

import Sidebar from "@/components/layout/Sidebar";
import SessionGuard from "@/components/SessionGuard";
import { useThemeTokens } from "@/lib/useThemeTokens";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const t = useThemeTokens();
    return (
        <div style={{
            display: "flex",
            height: "100vh",
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
