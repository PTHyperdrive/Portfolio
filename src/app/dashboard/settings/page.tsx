"use client";

import AccountSettingsView from "@/components/AccountSettingsView";
import { useThemeTokens } from "@/lib/useThemeTokens";

/**
 * /dashboard/settings — renders within the dashboard sidebar layout.
 * This is the context-aware "fused" view: sidebar stays visible.
 */
export default function DashboardSettingsPage() {
    const t = useThemeTokens();

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 24 }}>
                Dashboard &nbsp;&bull;&nbsp; Settings
            </p>
            <AccountSettingsView />
        </div>
    );
}
