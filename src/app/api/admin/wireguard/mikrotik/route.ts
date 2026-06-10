import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listWgPeers } from "@/lib/mikrotik";

/**
 * GET /api/admin/wireguard/mikrotik
 * Returns raw MikroTik WireGuard peers from both interfaces.
 * Wireguard-VPN = admin/rent combined interface (was Remote-WG1).
 * Customers-WG1 = website-managed customer VPN.
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id || (session.user as { role?: string }).role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const [customerPeers, remotePeers] = await Promise.all([
            listWgPeers("Customers-WG1").catch(() => []),
            listWgPeers("Wireguard-VPN").catch(() => []),
        ]);

        return NextResponse.json({ customerPeers, remotePeers });
    } catch (err) {
        console.error("MikroTik WG query error:", err);
        return NextResponse.json(
            { error: "Failed to query MikroTik", customerPeers: [], remotePeers: [] },
            { status: 500 }
        );
    }
}
