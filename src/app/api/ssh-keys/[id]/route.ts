import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { require2fa, twoFactorErrorResponse } from "@/lib/require2fa";

/**
 * DELETE /api/ssh-keys/[id]
 * Remove a specific SSH key. Cannot delete the default key if other keys exist.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { id } = await params;

    // Step-up: removing a key is a critical security change — require TOTP if
    // the user has it. Token travels in an optional JSON body.
    const delBody = await req.json().catch(() => ({} as { totpToken?: string }));
    const stepUp = await require2fa(userId, delBody?.totpToken);
    if (!stepUp.ok) return twoFactorErrorResponse(stepUp.error!);

    const key = await prisma.sshKey.findFirst({
        where: { id, userId },
    });

    if (!key) {
        return NextResponse.json({ error: "SSH key not found." }, { status: 404 });
    }

    // If deleting the default key, promote the next oldest key
    if (key.isDefault) {
        const nextKey = await prisma.sshKey.findFirst({
            where:   { userId, id: { not: key.id } },
            orderBy: { createdAt: "asc" },
        });
        if (nextKey) {
            await prisma.sshKey.update({
                where: { id: nextKey.id },
                data:  { isDefault: true },
            });
        }
    }

    await prisma.sshKey.delete({ where: { id } });

    void audit({
        userId,
        action:       "SSH_KEY_REMOVE",
        resourceType: "SshKey",
        resourceId:   id,
        metadata:     { name: key.name },
        req,
    });

    return NextResponse.json({ success: true });
}

/**
 * PATCH /api/ssh-keys/[id]
 * Update key name or promote it to default.
 * Body: { name?: string, setDefault?: boolean }
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { id } = await params;
    const body = await req.json() as { name?: string; setDefault?: boolean };

    const key = await prisma.sshKey.findFirst({ where: { id, userId } });
    if (!key) {
        return NextResponse.json({ error: "SSH key not found." }, { status: 404 });
    }

    const updates: { name?: string; isDefault?: boolean } = {};

    if (body.name?.trim()) {
        updates.name = body.name.trim();
    }

    if (body.setDefault) {
        // Clear existing default
        await prisma.sshKey.updateMany({
            where: { userId, isDefault: true },
            data:  { isDefault: false },
        });
        updates.isDefault = true;
    }

    const updated = await prisma.sshKey.update({
        where: { id },
        data:  updates,
    });

    return NextResponse.json({ key: updated });
}
