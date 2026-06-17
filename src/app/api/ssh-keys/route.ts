import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { require2fa, twoFactorErrorResponse } from "@/lib/require2fa";

const MAX_KEYS_PER_USER = 10;

/** Supported SSH key prefixes for validation */
const VALID_KEY_PREFIXES = [
    "ssh-ed25519",
    "ssh-rsa",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
    "sk-ssh-ed25519@openssh.com",    // hardware-backed (YubiKey, ePass2003)
    "sk-ecdsa-sha2-nistp256@openssh.com",
];

function validatePublicKey(key: string): string | null {
    const trimmed = key.trim();
    if (!VALID_KEY_PREFIXES.some((p) => trimmed.startsWith(p))) {
        return "Invalid SSH public key format. Supported types: Ed25519, RSA, ECDSA, SK-ED25519.";
    }
    // Basic length sanity check
    if (trimmed.length < 40 || trimmed.length > 16384) {
        return "SSH public key length is invalid.";
    }
    return null; // valid
}

/**
 * GET /api/ssh-keys
 * Returns all SSH keys for the authenticated user.
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await prisma.sshKey.findMany({
        where:   { userId: session.user.id },
        select:  { id: true, name: true, publicKey: true, isDefault: true, createdAt: true },
        orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ keys });
}

/**
 * POST /api/ssh-keys
 * Add a new SSH public key for the authenticated user.
 * Body: { name: string, publicKey: string, setDefault?: boolean }
 */
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json() as { name?: string; publicKey?: string; setDefault?: boolean; totpToken?: string };
    const { name, publicKey, setDefault = false } = body;

    // Step-up: adding a key grants VM access — require TOTP if the user has it.
    const stepUp = await require2fa(userId, body.totpToken);
    if (!stepUp.ok) return twoFactorErrorResponse(stepUp.error!);

    if (!name?.trim()) {
        return NextResponse.json({ error: "Key name is required." }, { status: 400 });
    }
    if (!publicKey?.trim()) {
        return NextResponse.json({ error: "Public key is required." }, { status: 400 });
    }

    const keyError = validatePublicKey(publicKey);
    if (keyError) {
        return NextResponse.json({ error: keyError }, { status: 400 });
    }

    // Enforce per-user key limit
    const existingKeys = await prisma.sshKey.findMany({
        where:  { userId },
        select: { id: true, publicKey: true },
    });

    if (existingKeys.length >= MAX_KEYS_PER_USER) {
        return NextResponse.json(
            { error: `Maximum of ${MAX_KEYS_PER_USER} SSH keys per account. Remove an existing key first.` },
            { status: 422 }
        );
    }

    // Check for duplicate key content (@@unique not possible on TEXT in MySQL)
    const isDuplicate = existingKeys.some((k: { publicKey: string }) => k.publicKey.trim() === publicKey.trim());
    if (isDuplicate) {
        return NextResponse.json({ error: "This public key is already saved to your account." }, { status: 409 });
    }

    try {
        // If setDefault, clear existing default first
        if (setDefault) {
            await prisma.sshKey.updateMany({
                where: { userId, isDefault: true },
                data:  { isDefault: false },
            });
        }

        const key = await prisma.sshKey.create({
            data: {
                userId,
                name:      name.trim(),
                publicKey: publicKey.trim(),
                isDefault: setDefault || existingKeys.length === 0, // first key is always default
            },
        });

        void audit({
            userId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            action:       "SSH_KEY_ADD" as any,
            resourceType: "SshKey",
            resourceId:   key.id,
            metadata:     { name: key.name, keyType: publicKey.trim().split(" ")[0] },
            req,
        });

        return NextResponse.json({ key }, { status: 201 });
    } catch (err: unknown) {
        console.error("SSH key add error:", err);
        return NextResponse.json({ error: "Failed to add SSH key." }, { status: 500 });
    }
}
