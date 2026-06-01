import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addWgPeer, removeWgPeer, getWgInterfaceInfo, getWgConfig } from "@/lib/mikrotik";
import crypto from "crypto";
import QRCode from "qrcode";

const MAX_PEERS_USER = 3;
const MAX_PEERS_ADMIN = 5;

/**
 * X25519 key pair generation for WireGuard.
 * Uses Node.js crypto module.
 */
function generateWgKeyPair() {
    const keyPair = crypto.generateKeyPairSync("x25519", {
        publicKeyEncoding: { type: "spki", format: "der" },
        privateKeyEncoding: { type: "pkcs8", format: "der" },
    });
    // Extract raw 32-byte keys from DER encoding
    const privateKey = keyPair.privateKey.subarray(-32);
    const publicKey = keyPair.publicKey.subarray(-32);
    return {
        privateKey: Buffer.from(privateKey).toString("base64"),
        publicKey: Buffer.from(publicKey).toString("base64"),
    };
}

/**
 * Generate a pre-shared key (random 32 bytes, base64)
 */
function generatePsk() {
    return crypto.randomBytes(32).toString("base64");
}

/**
 * Find next available IP in the WireGuard subnet.
 * Subnet format: "10.98.0.0/24" → allocates 10.98.0.2 through 10.98.0.254
 * .1 is the gateway, .0 is network, .255 is broadcast.
 */
async function findNextAvailableIp(): Promise<string> {
    const config = getWgConfig();
    const [base] = config.subnet.split("/");
    const parts = base.split(".").map(Number);

    // Get all assigned IPs
    const usedPeers = await prisma.wgPeer.findMany({
        where: { active: true },
        select: { assignedIp: true },
    });
    const usedSet = new Set(usedPeers.map((p) => p.assignedIp));

    // Try .2 through .254
    for (let i = 2; i <= 254; i++) {
        const candidate = `${parts[0]}.${parts[1]}.${parts[2]}.${i}`;
        if (!usedSet.has(candidate)) return candidate;
    }
    throw new Error("No available IPs in WireGuard subnet");
}

// ─── GET: List user's WireGuard peers ────────────────────────────

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const peers = await prisma.wgPeer.findMany({
        where: { userId: session.user.id, active: true },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            name: true,
            assignedIp: true,
            allowedSubnets: true,
            active: true,
            createdAt: true,
            publicKey: true,
        },
    });

    return NextResponse.json({ peers });
}

// ─── POST: Generate new WireGuard peer ───────────────────────────

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const peerName = (body.name as string)?.trim();
    if (!peerName || peerName.length > 32) {
        return NextResponse.json({ error: "Peer name is required (max 32 chars)" }, { status: 400 });
    }

    const isAdmin = session.user.role === "ADMIN";
    const maxPeers = isAdmin ? MAX_PEERS_ADMIN : MAX_PEERS_USER;

    // Check peer limit
    const activePeers = await prisma.wgPeer.count({
        where: { userId: session.user.id, active: true },
    });
    if (activePeers >= maxPeers) {
        return NextResponse.json(
            { error: `Maximum ${maxPeers} active peers allowed. Revoke an existing peer first.` },
            { status: 409 }
        );
    }

    // Determine allowed subnets based on role
    let allowedSubnets: string[];
    if (isAdmin) {
        allowedSubnets = ["10.0.0.0/8"];
    } else {
        // Find user's VPC assignment
        const vpcAssignment = await prisma.vpcAssignment.findFirst({
            where: { vpsInstance: { userId: session.user.id } },
            include: { vpc: { select: { subnet: true } } },
        });
        if (!vpcAssignment) {
            return NextResponse.json(
                { error: "You need a VPC assignment before creating VPN peers. Contact an administrator." },
                { status: 403 }
            );
        }
        allowedSubnets = [vpcAssignment.vpc.subnet];
    }

    try {
        // Generate keys
        const keys = generateWgKeyPair();
        const psk = generatePsk();
        const assignedIp = await findNextAvailableIp();

        // Push peer to MikroTik
        const mikrotikId = await addWgPeer({
            publicKey: keys.publicKey,
            presharedKey: psk,
            allowedAddress: `${assignedIp}/32`,
            comment: `NRSP-WG-${session.user.id.slice(0, 8)}-${peerName}`,
        });

        // Store in DB
        const peer = await prisma.wgPeer.create({
            data: {
                userId: session.user.id,
                name: peerName,
                publicKey: keys.publicKey,
                presharedKey: psk,
                assignedIp,
                allowedSubnets: JSON.stringify(allowedSubnets),
                mikrotikPeerId: mikrotikId,
            },
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId: session.user.id,
                action: "WG_PEER_CREATE",
                resourceType: "WireGuard",
                resourceId: peer.id,
                metadata: { peerName, assignedIp, allowedSubnets },
            },
        });

        // Get WG interface info for client config
        let serverPubKey = "";
        try {
            const wgInfo = await getWgInterfaceInfo();
            serverPubKey = wgInfo.publicKey;
        } catch {
            // Non-fatal — config will have placeholder
            serverPubKey = "<MIKROTIK_PUBLIC_KEY>";
        }

        const config = getWgConfig();
        const allowedIpsStr = [...allowedSubnets, `${config.gateway}/32`].join(", ");

        // Build client config
        const clientConfig = [
            "[Interface]",
            `PrivateKey = ${keys.privateKey}`,
            `Address = ${assignedIp}/32`,
            `DNS = 10.0.0.2`,
            "",
            "[Peer]",
            `PublicKey = ${serverPubKey}`,
            `PresharedKey = ${psk}`,
            `Endpoint = ${config.endpoint}:${config.port}`,
            `AllowedIPs = ${allowedIpsStr}`,
            `PersistentKeepalive = 25`,
        ].join("\n");

        // Generate QR code as data URL
        const qrDataUrl = await QRCode.toDataURL(clientConfig, {
            width: 400,
            margin: 2,
            color: { dark: "#000000", light: "#ffffff" },
        });

        return NextResponse.json({
            peer: {
                id: peer.id,
                name: peer.name,
                assignedIp: peer.assignedIp,
                allowedSubnets,
                createdAt: peer.createdAt,
            },
            config: clientConfig,
            qrCode: qrDataUrl,
        });
    } catch (err) {
        console.error("WG peer create error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to create peer" },
            { status: 500 }
        );
    }
}
