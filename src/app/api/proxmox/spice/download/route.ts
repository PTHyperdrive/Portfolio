import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSpiceTicket } from "@/lib/proxmox";
import { audit } from "@/lib/audit";

/**
 * GET /api/proxmox/spice/download?vmId=150&node=Timox-1
 * Generates and streams a SPICE .vv file for virt-viewer.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const vmId = req.nextUrl.searchParams.get("vmId");
        const node = req.nextUrl.searchParams.get("node");

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

        // Request SPICE ticket from Proxmox VE
        const spice = await getSpiceTicket(node, vmId);

        // Auto-resolve internal IP to FQDN from the host-subject CN field
        // e.g. "OU=PVE Cluster Node,O=Proxmox Virtual Environment,CN=Timox-1.notrespond.com"
        const cnMatch = spice["host-subject"]?.match(/CN=([^,]+)/i);
        const fqdn = cnMatch?.[1] || spice.host;

        // Replace internal IPs with the resolved FQDN in proxy and host fields
        let proxy = spice.proxy || "";
        if (fqdn && proxy) {
            // proxy format: "http://10.0.1.1:3128" → "http://timox-1.notrespond.com:3128"
            proxy = proxy.replace(/\/\/[\d.]+/, `//${fqdn.toLowerCase()}`);
        }

        // Build the .vv file content in exact virt-viewer INI format
        // Field order matches the Go reference implementation
        const vvContent = [
            "[virt-viewer]",
            `type=${spice.type || "spice"}`,
            `host=${spice.host}`,
            `tls-port=${spice["tls-port"]}`,
            `password=${spice.password}`,
            `proxy=${proxy}`,
            `host-subject=${spice["host-subject"]}`,
            `title=VM ${vmId}`,
            `toggle-fullscreen=${spice["toggle-fullscreen"] || "Shift+F11"}`,
            `release-cursor=${spice["release-cursor"] || "Ctrl+Alt+R"}`,
            `secure-attention=${spice["secure-attention"] || "Ctrl+Alt+Ins"}`,
            `delete-this-file=1`,
            `ca=${spice.ca}`,
        ].join("\n") + "\n";

        // ISO 27001: Audit SPICE console access
        void audit({
            userId: session.user.id,
            action: "CONSOLE_SPICE_ACCESS",
            resourceType: "VirtualMachine",
            resourceId: vmId,
            metadata: { node },
            req,
        });

        return new Response(vvContent, {
            status: 200,
            headers: {
                "Content-Type": "application/x-virt-viewer",
                "Content-Disposition": `attachment; filename="pve-spice-${vmId}.vv"`,
            },
        });
    } catch (error) {
        console.error("SPICE download error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to generate SPICE file" },
            { status: 500 }
        );
    }
}
