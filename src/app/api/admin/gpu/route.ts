import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGpuCapacityReport } from "@/lib/gpu-allocator";

/**
 * GET /api/admin/gpu
 *
 * Returns a live snapshot of all GPU nodes with their VRAM usage and
 * the list of VMs currently allocated to each GPU.
 *
 * Admin-only endpoint.
 */
export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((session.user as { role?: string }).role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const report = await getGpuCapacityReport();
        return NextResponse.json({ gpus: report });
    } catch (error) {
        console.error("GPU report error:", error);
        return NextResponse.json({ error: "Failed to fetch GPU capacity" }, { status: 500 });
    }
}
