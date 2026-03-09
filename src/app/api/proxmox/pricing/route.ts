import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchPricingTiers, updatePricingTier, fetchGPUResources, updateGPUResource } from "@/lib/proxmox";

/**
 * GET /api/proxmox/pricing — Fetch pricing tiers and GPU resources
 * Public endpoint (pricing is public info)
 */
export async function GET() {
    try {
        const [tiers, gpus] = await Promise.all([
            fetchPricingTiers().catch(() => []),
            fetchGPUResources().catch(() => []),
        ]);

        return NextResponse.json({ tiers, gpus });
    } catch (error) {
        console.error("Pricing fetch error:", error);
        return NextResponse.json({ error: "Failed to load pricing" }, { status: 500 });
    }
}

/**
 * PUT /api/proxmox/pricing — Update a pricing tier or GPU resource (admin only)
 */
export async function PUT(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check admin role
        if ((session.user as { role?: string }).role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const { type, id, data } = await req.json();

        if (!type || !id || !data) {
            return NextResponse.json({ error: "type, id, and data are required" }, { status: 400 });
        }

        let result;
        if (type === "tier") {
            result = await updatePricingTier(id, data);
        } else if (type === "gpu") {
            result = await updateGPUResource(id, data);
        } else {
            return NextResponse.json({ error: "Invalid type (use 'tier' or 'gpu')" }, { status: 400 });
        }

        return NextResponse.json({ success: true, result });
    } catch (error) {
        console.error("Pricing update error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Update failed" },
            { status: 500 }
        );
    }
}
