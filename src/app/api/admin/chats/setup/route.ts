import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET  /api/admin/chats/setup — Check if admin ECDH keys are configured.
 * POST /api/admin/chats/setup — Register admin ECDH keypair (first-time setup).
 *
 * Admin's keypair is stored in SystemConfig:
 *   admin_chat_pub_key     — public key (JWK JSON, plaintext)
 *   admin_chat_enc_priv_key — private key (encrypted with admin PIN, base64)
 *   admin_chat_key_iv      — IV for private key encryption (base64)
 *   admin_chat_pin_hash    — bcrypt hash of admin chat PIN
 */

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id)
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        if (user?.role !== "ADMIN")
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const pubRow = await prisma.systemConfig.findUnique({ where: { key: "admin_chat_pub_key" } });
        const pinRow = await prisma.systemConfig.findUnique({ where: { key: "admin_chat_pin_hash" } });

        return NextResponse.json({
            configured: !!pubRow && !!pinRow,
            pubKey: pubRow?.value ?? null,
        });
    } catch (err) {
        console.error("[GET /api/admin/chats/setup]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id)
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        if (user?.role !== "ADMIN")
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { pubKey, encPrivKey, keyIv, pinHash } = await req.json();
        if (!pubKey || !encPrivKey || !keyIv || !pinHash)
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

        // Upsert all four config entries atomically
        await Promise.all([
            prisma.systemConfig.upsert({
                where: { key: "admin_chat_pub_key" },
                update: { value: pubKey },
                create: { key: "admin_chat_pub_key", value: pubKey },
            }),
            prisma.systemConfig.upsert({
                where: { key: "admin_chat_enc_priv_key" },
                update: { value: encPrivKey },
                create: { key: "admin_chat_enc_priv_key", value: encPrivKey },
            }),
            prisma.systemConfig.upsert({
                where: { key: "admin_chat_key_iv" },
                update: { value: keyIv },
                create: { key: "admin_chat_key_iv", value: keyIv },
            }),
            prisma.systemConfig.upsert({
                where: { key: "admin_chat_pin_hash" },
                update: { value: pinHash },
                create: { key: "admin_chat_pin_hash", value: pinHash },
            }),
        ]);

        // Audit
        await prisma.auditLog.create({
            data: {
                userId: session.user.id,
                action: "ADMIN_CHAT_KEY_SETUP",
                resourceType: "SystemConfig",
                outcome: "SUCCESS",
            },
        }).catch(() => {});

        return NextResponse.json({ ok: true }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/admin/chats/setup]", err);
        return NextResponse.json({ error: "Failed to save keys" }, { status: 500 });
    }
}
