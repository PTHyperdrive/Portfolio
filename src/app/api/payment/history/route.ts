import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/payment/history
 * Returns the authenticated user's active plan info + full transaction history.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [user, transactions, vpsCount] = await Promise.all([
            prisma.user.findUnique({
                where: { id: session.user.id },
                select: { activePlan: true, planActivatedAt: true, balance: true, trialExpiresAt: true },
            }),
            prisma.transaction.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: "desc" },
            }),
            prisma.vpsInstance.count({
                where: { userId: session.user.id }
            })
        ]);

        const totalSpent = transactions.reduce(
            (sum, tx) => sum + Number(tx.amount),
            0
        );

        return NextResponse.json({
            activePlan: user?.activePlan ?? null,
            planActivatedAt: user?.planActivatedAt ?? null,
            trialExpiresAt: user?.trialExpiresAt ?? null,
            credits: Number(user?.balance ?? 0),
            vpsCount,
            totalSpent,
            transactions,
        });
    } catch (error) {
        console.error("Payment history error:", error);
        return NextResponse.json({ error: "Failed to load billing data" }, { status: 500 });
    }
}
