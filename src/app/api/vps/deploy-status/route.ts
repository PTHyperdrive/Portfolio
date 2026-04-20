import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
    getVMStatus,
    getGuestAgentNetworkInfo,
    extractPrimaryIPv4,
} from "@/lib/proxmox";

/**
 * GET /api/vps/deploy-status?vmId=<id>
 *
 * Polls the provisioning status of a Cloud-Init deployed VM.
 *
 * Returns the current lifecycle stage:
 *   - "provisioning" — VM exists in DB but not yet running
 *   - "booting"      — VM is running, guest agent not yet responsive
 *   - "configuring"  — Guest agent online, Cloud-Init still running
 *   - "ready"        — Fully provisioned with IP assigned
 *   - "stopped"      — VM is stopped (user action or error)
 *   - "error"        — Unknown/failed state
 *
 * The frontend polls this endpoint at 3–5s intervals after deploy,
 * then stops once status reaches "ready".
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const { searchParams } = new URL(req.url);
        const vmId = searchParams.get("vmId");

        if (!vmId) {
            return NextResponse.json({ error: "vmId is required" }, { status: 400 });
        }

        // Verify ownership
        const instance = await prisma.vpsInstance.findFirst({
            where: { userId, vmId },
            select: {
                vmId: true,
                node: true,
                name: true,
                os: true,
                status: true,
                specs: true,
            },
        });

        if (!instance) {
            return NextResponse.json({ error: "VM not found" }, { status: 404 });
        }

        // Query Proxmox for live VM status
        let pveStatus: string = "unknown";
        try {
            const status = await getVMStatus(instance.node, vmId) as {
                status: string;
                qmpstatus?: string;
            };
            pveStatus = status.status || "unknown";
        } catch {
            // Proxmox API unreachable — return DB status as fallback
            return NextResponse.json({
                vmId:    instance.vmId,
                name:    instance.name,
                status:  instance.status === "running" ? "booting" : "provisioning",
                message: "Waiting for hypervisor response...",
                ip:      null,
            });
        }

        // ── Determine lifecycle stage ────────────────────────────────
        let stage: string;
        let message: string;
        let ip: string | null = null;

        if (pveStatus === "stopped") {
            stage   = "stopped";
            message = "VM is stopped.";
        } else if (pveStatus === "running") {
            // Try to get IP from guest agent
            const netInfo = await getGuestAgentNetworkInfo(instance.node, vmId);
            ip = extractPrimaryIPv4(netInfo);

            if (ip) {
                stage   = "ready";
                message = `VM is ready. Connect via SSH: ${ip}`;

                // Update DB status to running if not already
                if (instance.status !== "running") {
                    await prisma.vpsInstance.updateMany({
                        where: { userId, vmId },
                        data:  { status: "running" },
                    });
                }
            } else if (netInfo) {
                stage   = "configuring";
                message = "Cloud-Init is configuring the system...";
            } else {
                stage   = "booting";
                message = "VM is booting — waiting for guest agent...";
            }
        } else {
            stage   = "provisioning";
            message = `VM status: ${pveStatus}`;
        }

        // Extract template info from specs
        const specs = instance.specs as Record<string, unknown> | null;
        const templateName   = specs?.templateName as string | undefined;
        const provisionMethod = specs?.provisionMethod as string | undefined;

        return NextResponse.json({
            vmId:       instance.vmId,
            name:       instance.name,
            os:         instance.os,
            status:     stage,
            message,
            ip,
            templateName:    templateName ?? null,
            provisionMethod: provisionMethod ?? "legacy",
        });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("Deploy status error:", error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
