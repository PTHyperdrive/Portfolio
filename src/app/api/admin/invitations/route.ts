import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/invitations — List all invitation codes (admin overview)
 */
export async function GET() {
    const { error } = await requireAdmin();
    if (error) return error;

    try {
        const codes = await prisma.invitationCode.findMany({
            include: {
                creator: { select: { id: true, name: true, email: true } },
                redemptions: {
                    select: { userId: true, redeemedAt: true, context: true },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ codes });
    } catch (e) {
        console.error("[admin/invitations] GET error:", e);
        return NextResponse.json({ error: "Failed to load invitation codes" }, { status: 500 });
    }
}

/**
 * PUT /api/admin/invitations — Deactivate/reactivate an invitation code
 * Body: { id: string, active: boolean }
 */
export async function PUT(req: NextRequest) {
    const { error } = await requireAdmin();
    if (error) return error;

    try {
        const { id, active } = await req.json();
        if (!id || typeof active !== "boolean") {
            return NextResponse.json({ error: "id and active (boolean) are required" }, { status: 400 });
        }

        const code = await prisma.invitationCode.update({
            where: { id },
            data: { active },
            select: { id: true, code: true, active: true },
        });

        return NextResponse.json({ success: true, code });
    } catch (e) {
        console.error("[admin/invitations] PUT error:", e);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}
