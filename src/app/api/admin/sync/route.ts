import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getClusterResources, type ClusterVMResource } from "@/lib/proxmox";

/**
 * GET /api/admin/sync
 *
 * Admin-only cluster sync: fetches live CPU/RAM/Disk usage and status for
 * every VM and LXC container across all Proxmox nodes in the cluster.
 *
 * Uses GET /cluster/resources?type=vm — a single aggregator call, no
 * per-node looping required.
 *
 * Response shape:
 * {
 *   vms: ClusterVMResource[],      // all VMs sorted by node → vmid
 *   summary: {
 *     total:     number,
 *     running:   number,
 *     stopped:   number,
 *     templates: number,
 *     byNode: { [node: string]: { total, running, stopped } }
 *   },
 *   syncedAt: string (ISO 8601)
 * }
 */
export async function GET() {
    try {
        // ── Auth ───────────────────────────────────────────────────
        const session = await auth();
        if ((session?.user as { role?: string })?.role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        // ── Fetch cluster resources ────────────────────────────────
        const vms: ClusterVMResource[] = await getClusterResources();

        // ── Build summary ──────────────────────────────────────────
        const byNode: Record<string, { total: number; running: number; stopped: number }> = {};

        for (const vm of vms) {
            if (!byNode[vm.node]) {
                byNode[vm.node] = { total: 0, running: 0, stopped: 0 };
            }
            byNode[vm.node].total++;
            if (vm.status === "running") byNode[vm.node].running++;
            else                         byNode[vm.node].stopped++;
        }

        const summary = {
            total:     vms.length,
            running:   vms.filter((v) => v.status === "running").length,
            stopped:   vms.filter((v) => v.status === "stopped").length,
            templates: vms.filter((v) => v.template).length,
            byNode,
        };

        return NextResponse.json({
            vms,
            summary,
            syncedAt: new Date().toISOString(),
        });

    } catch (error) {
        console.error("[admin_sync] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Sync failed" },
            { status: 500 }
        );
    }
}
