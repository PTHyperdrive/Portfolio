import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVMStatus } from "@/lib/proxmox";

/**
 * GET /api/proxmox/vms
 * List the authenticated user's VPS instances with live Proxmox data
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get user's VPS instances from our database
        const instances = await prisma.vpsInstance.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
        });

        // Enrich with live data from Proxmox VE
        const enriched = await Promise.all(
            instances.map(async (inst: { node: string; vmId: string; specs: unknown;[key: string]: unknown }) => {
                let liveData = null;
                try {
                    liveData = await getVMStatus(inst.node, inst.vmId);
                } catch {
                    // Proxmox may be unreachable — show DB status only
                }
                return {
                    ...inst,
                    specs: inst.specs as Record<string, unknown> | null,
                    liveData,
                };
            })
        );

        return NextResponse.json({ instances: enriched });
    } catch (error) {
        console.error("VMs list error:", error);
        return NextResponse.json({ error: "Failed to load VMs" }, { status: 500 });
    }
}
