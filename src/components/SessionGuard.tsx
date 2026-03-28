"use client";

import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";

/**
 * SessionGuard
 *
 * Mount this once inside an authenticated layout. It watches the NextAuth
 * session object for the `error: "SessionRevoked"` flag that the jwt callback
 * sets when a DeviceSession is deleted from the database.
 *
 * When detected, it immediately calls signOut() which clears the local JWT
 * cookie and redirects to the login page — ensuring revoked sessions cannot
 * continue to access the dashboard.
 */
export default function SessionGuard() {
    const { data: session } = useSession();

    useEffect(() => {
        const user = session?.user as Record<string, unknown> | undefined;
        if (user?.error === "SessionRevoked") {
            console.warn("[SessionGuard] Session was revoked — signing out.");
            void signOut({ callbackUrl: "/login?error=SessionRevoked" });
        }
    }, [session]);

    // Renders nothing — purely behavioral
    return null;
}
