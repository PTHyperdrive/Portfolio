import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { removeWgPeer } from "@/lib/mikrotik";

// ─── DELETE: Revoke a WireGuard peer ─────────────────────────────

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ peerId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { peerId } = await params;
    const isAdmin = session.user.role === "ADMIN";

    // Find peer — admin can revoke any, user can only revoke their own
    const peer = await prisma.wgPeer.findUnique({ where: { id: peerId } });
    if (!peer) {
        return NextResponse.json({ error: "Peer not found" }, { status: 404 });
    }
    if (!isAdmin && peer.userId !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!peer.active) {
        return NextResponse.json({ error: "Peer already revoked" }, { status: 400 });
    }

    try {
        // Remove from MikroTik
        if (peer.mikrotikPeerId) {
            try {
                await removeWgPeer(peer.mikrotikPeerId);
            } catch (err) {
                console.warn("MikroTik peer removal failed (may be already removed):", err);
            }
        }

        // Mark as revoked in DB
        await prisma.wgPeer.update({
            where: { id: peerId },
            data: { active: false, revokedAt: new Date() },
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId: session.user.id,
                action: "WG_PEER_REVOKE",
                resourceType: "WireGuard",
                resourceId: peerId,
                metadata: {
                    peerName: peer.name,
                    assignedIp: peer.assignedIp,
                    revokedUserId: peer.userId,
                },
            },
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("WG peer revoke error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to revoke peer" },
            { status: 500 }
        );
    }
}
