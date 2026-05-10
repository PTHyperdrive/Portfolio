"use client";

import AccountSettingsView from "@/components/AccountSettingsView";

/**
 * /account-settings — standalone view (no sidebar).
 * Rendered when navigating from Console Hub or non-sidebar contexts.
 */
export default function AccountSettingsPage() {
    return (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <AccountSettingsView />
        </div>
    );
}
