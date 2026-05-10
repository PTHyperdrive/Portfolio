"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import SessionGuard from "@/components/SessionGuard";
import { useThemeTokens } from "@/lib/useThemeTokens";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const t = useThemeTokens();
    const pathname = usePathname();

    // The Console Hub (/dashboard exact) renders full-width with no sidebar,
    // mirroring GCP where the Welcome page is a standalone launcher.
    const isConsoleHub = pathname === "/dashboard";

    if (isConsoleHub) {
        return (
            <div style={{
                minHeight: "100vh",
                backgroundColor: t.bgPrimary,
                color: t.textPrimary,
                fontFamily: t.fontFamily,
            }}>
                <SessionGuard />
                {children}
            </div>
        );
    }

    // All other /dashboard/* sub-routes render with the cloud sidebar
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
