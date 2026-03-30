import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVMStatus, updateVMConfig } from "@/lib/proxmox";
import { audit } from "@/lib/audit";

/**
 * PATCH /api/proxmox/vms/[vmId]/display
 *
 * Switches the VM console adapter between noVNC (vga: std) and SPICE (vga: qxl).
 * The VM MUST be fully stopped — changing the VGA device while running can corrupt state.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { vmId } = await params;
        const body = await req.json() as { displayType?: string; node?: string };
        const { displayType, node } = body;

        // ── 1. Validate input ────────────────────────────────────────────
        if (displayType !== "novnc" && displayType !== "spice") {
            return NextResponse.json(
                { error: "Invalid displayType. Must be 'novnc' or 'spice'." },
                { status: 400 }
            );
        }

        // ── 2. Verify ownership ──────────────────────────────────────────
        const instance = await prisma.vpsInstance.findFirst({
            where: { vmId, userId: session.user.id },
        });

        if (!instance) {
            return NextResponse.json({ error: "VM not found or not yours" }, { status: 403 });
        }

        const pveNode = node || instance.node;

        // ── 3. Safety check: VM must be stopped ──────────────────────────
        let liveStatus: { status?: string } | null = null;
        try {
            liveStatus = await getVMStatus(pveNode, vmId) as { status?: string };
        } catch {
            // If Proxmox is unreachable, fall back to DB status
        }

        const currentStatus = (liveStatus?.status ?? instance.status).toLowerCase();
        if (currentStatus !== "stopped") {
            return NextResponse.json(
                { error: "Virtual Machine must be turned completely off to change display settings." },
                { status: 400 }
            );
        }

        // ── 4. Push VGA config to Proxmox ───────────────────────────────
        // noVNC:  vga=std  (standard VGA, compatible with all VNC clients)
        // SPICE:  vga=qxl  (QXL GPU, required for SPICE protocol)
        const vgaType = displayType === "spice" ? "qxl" : "std";
        await updateVMConfig(pveNode, vmId, { vga: vgaType });

        // ── 5. Persist to database ────────────────────────────────────────
        await prisma.vpsInstance.update({
            where: { id: instance.id },
            data: { displayType },
        });

        // ISO 27001: Audit display change
        void audit({
            userId: session.user.id,
            action: "VM_DISPLAY_CHANGE",
            resourceType: "VirtualMachine",
            resourceId: vmId,
            metadata: { displayType, vga: vgaType, node: pveNode },
            req,
        });

        return NextResponse.json({
            success: true,
            displayType,
            vga: vgaType,
        });
    } catch (error) {
        console.error("[display] PATCH error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to update display type" },
            { status: 500 }
        );
    }
}
