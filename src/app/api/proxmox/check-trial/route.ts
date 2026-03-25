import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTrialStatus } from "@/lib/trial-lifecycle";
import { prisma } from "@/lib/db";
import { destroyVM } from "@/lib/proxmox";

/**
 * GET /api/proxmox/check-trial
 * Returns trial status for the authenticated user.
 * If past 33 days, automatically destroys the VM and clears DB records.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const status = await getTrialStatus(session.user.id);

        // ── Auto-cleanup if past grace period ──
        if (status.isPastGrace) {
            // Find and destroy trial VPS instances
            const instances = await prisma.vpsInstance.findMany({
                where: { userId: session.user.id, orderId: "trial" },
            });

            for (const inst of instances) {
                try {
                    await destroyVM(inst.node, inst.vmId);
                } catch {
                    // Proxmox may already have it removed — continue cleanup
                }
                await prisma.vpsInstance.delete({ where: { id: inst.id } });
            }
        }

        return NextResponse.json({ status });
    } catch (error) {
        console.error("Check trial error:", error);
        return NextResponse.json({ error: "Failed to check trial status" }, { status: 500 });
    }
}
