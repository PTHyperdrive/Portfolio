import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/users/credits — Adjust a user's credit balance
 *
 * DELTA ONLY by design: admins add or remove an amount, they can never SET
 * an absolute balance. This keeps every change relative and auditable —
 * the ledger (CreditTransaction) always sums to the live balance.
 *
 * Body: { userId: string, delta: number (non-zero integer), reason?: string }
 *   - Negative deltas cannot push a balance below 0 (guarded decrement → 409).
 */
export async function POST(req: NextRequest) {
    const { userId: adminId, error } = await requireAdmin();
    if (error) return error;

    try {
        const body = await req.json().catch(() => ({}));
        const targetId = typeof body?.userId === "string" ? body.userId : "";
        const delta = Number(body?.delta);
        const reason = typeof body?.reason === "string" ? body.reason.slice(0, 200) : "";

        if (!targetId || !Number.isInteger(delta) || delta === 0) {
            return NextResponse.json(
                { error: "userId and a non-zero integer delta are required (no absolute set allowed)" },
                { status: 400 },
            );
        }

        const target = await prisma.user.findUnique({
            where: { id: targetId },
            select: { id: true, email: true, credits: true },
        });
        if (!target) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Removal is guarded so the balance can never go negative.
            const updated = await tx.user.updateMany({
                where: delta < 0
                    ? { id: targetId, credits: { gte: -delta } }
                    : { id: targetId },
                data: { credits: { increment: delta } },
            });
            if (updated.count === 0) return null;

            await tx.creditTransaction.create({
                data: {
                    userId: targetId,
                    type: delta > 0 ? "Admin_Grant" : "Admin_Removal",
                    amount: delta,
                    details: reason || `Admin adjustment by ${adminId}`,
                },
            });

            return tx.user.findUnique({
                where: { id: targetId },
                select: { credits: true },
            });
        });

        if (!result) {
            return NextResponse.json(
                { error: "Removal exceeds the user's balance", available: target.credits },
                { status: 409 },
            );
        }

        void audit({
            userId: adminId,
            action: "ADMIN_USER_MODIFY",
            resourceType: "Billing",
            resourceId: targetId,
            metadata: { kind: "credit_adjustment", delta, reason, newBalance: result.credits, targetEmail: target.email },
            req,
        });

        return NextResponse.json({ success: true, userId: targetId, delta, newBalance: result.credits });
    } catch (err) {
        console.error("[POST /api/admin/users/credits]", err);
        return NextResponse.json({ error: "Adjustment failed" }, { status: 500 });
    }
}
