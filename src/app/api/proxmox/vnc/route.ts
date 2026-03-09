import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVncTicket, getVncWebsocketUrl } from "@/lib/proxmox";

/**
 * POST /api/proxmox/vnc
 * Request a VNC proxy ticket for web console access.
 * Returns the noVNC connection URL.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { vmId, node } = await req.json();

        if (!vmId || !node) {
            return NextResponse.json({ error: "vmId and node are required" }, { status: 400 });
        }

        // Verify user owns this VM
        const instance = await prisma.vpsInstance.findFirst({
            where: { vmId, node, userId: session.user.id },
        });

        if (!instance) {
            return NextResponse.json({ error: "VM not found or access denied" }, { status: 403 });
        }

        // Request VNC ticket from Proxmox VE
        const { ticket, port } = await getVncTicket(node, vmId);
        const wsUrl = getVncWebsocketUrl(node, vmId, port, ticket);

        return NextResponse.json({
            ticket,
            port,
            wsUrl,
            pveHost: process.env.PROXMOX_VE_HOST,
            pvePort: process.env.PROXMOX_VE_PORT,
        });
    } catch (error) {
        console.error("VNC ticket error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to get VNC ticket" },
            { status: 500 }
        );
    }
}
