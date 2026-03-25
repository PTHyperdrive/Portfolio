import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { destroyVM } from "@/lib/proxmox";
import { verifyPassword } from "@/lib/security";

/**
 * POST /api/proxmox/vms/[vmId]/destroy
 * securely destroys a VM by requiring the user's account password.
 */
export async function POST(req: Request, { params }: { params: Promise<{ vmId: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { vmId } = await params;
        const { password, node } = await req.json() as { password?: string; node?: string };

        if (!password) {
            return NextResponse.json({ error: "Password is required to destroy an instance" }, { status: 400 });
        }
        if (!node) {
            return NextResponse.json({ error: "Node is required" }, { status: 400 });
        }

        // 1. Verify ownership
        const instance = await prisma.vpsInstance.findFirst({
            where: { vmId, userId: session.user.id },
        });

        if (!instance) {
            return NextResponse.json({ error: "VPS Instance not found or access denied" }, { status: 404 });
        }

        // 2. Verify account password
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { passwordHash: true },
        });

        if (!user?.passwordHash) {
            return NextResponse.json({ error: "Server configuration error (no password hash found)" }, { status: 500 });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
            return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
        }

        // 3. Trigger Proxmox API to destroy the VM
        try {
            await destroyVM(node, vmId);
        } catch (proxmoxErr) {
            console.error("Proxmox destroy fallback error:", proxmoxErr);
            // We'll continue to delete from DB even if Proxmox fails (e.g. if VM was already deleted manually)
        }

        // 4. Clean up DB record
        await prisma.vpsInstance.delete({
            where: { id: instance.id },
        });

        return NextResponse.json({ success: true, message: "Instance destroyed completely." });
    } catch (error) {
        console.error("Destroy VM error:", error);
        return NextResponse.json({ error: "Failed to destroy VM" }, { status: 500 });
    }
}
