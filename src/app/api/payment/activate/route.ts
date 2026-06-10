import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getServerPlanConfig } from "@/lib/pricing-config";

/**
 * POST /api/payment/activate
 * Activates a plan for the authenticated user.
 *
 * SECURITY: the price is resolved SERVER-SIDE from the plan catalog and paid
 * from the user's prepaid credit wallet. The client cannot influence the
 * amount or payment method — any `amount`/`method` in the body is ignored.
 * Credits only ever enter the wallet via the HMAC-verified crypto webhook,
 * admin grants, or promo codes, so this can no longer mint free subscriptions.
 *
 * Body: { plan: string }
 *   - "Trial Plan" (price 0): free, one-time.
 *   - Priced plans: charged in credits; 402 if the wallet is short.
 *   - Other price-0 plans (e.g. Operator-Exclusive): admin-assigned only.
 *
 * Admins may activate any plan without being charged (for testing).
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;

        const body = await req.json().catch(() => ({}));
        const plan = typeof body?.plan === "string" ? body.plan.trim() : "";
        if (!plan) {
            return NextResponse.json({ error: "Plan name is required" }, { status: 400 });
        }

        // Resolve against the server-side catalog — rejects arbitrary names and
        // is the authoritative source of price (with admin overrides applied).
        const planConfig = await getServerPlanConfig(plan);
        if (!planConfig) {
            return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { hasUsedTrial: true, role: true, activePlan: true, credits: true },
        });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        const isAdmin = user.role === "ADMIN";

        // ── Trial Plan: free, one-time ──────────────────────────────────
        if (plan === "Trial Plan") {
            if (user.hasUsedTrial && !isAdmin) {
                return NextResponse.json(
                    { error: "You have already claimed your one-time free trial." },
                    { status: 403 },
                );
            }
            const transaction = await activateWithoutCharge(userId, plan, "trial", req);
            return NextResponse.json({ success: true, transaction, creditsCharged: 0 });
        }

        // Prevent re-purchasing a plan the user already holds.
        if (user.activePlan === plan && !isAdmin) {
            return NextResponse.json(
                { error: "You already have an active subscription for this plan." },
                { status: 400 },
            );
        }

        // ── Admins activate any plan without charge (testing) ───────────
        if (isAdmin) {
            const transaction = await activateWithoutCharge(userId, plan, "admin_grant", req);
            return NextResponse.json({ success: true, transaction, creditsCharged: 0 });
        }

        const price = planConfig.priceInCredits;

        // Non-trial plans with no price are special/admin-assigned (e.g.
        // Operator-Exclusive) and are not available for self-service.
        if (price <= 0) {
            return NextResponse.json(
                { error: "This plan is not available for self-service activation." },
                { status: 403 },
            );
        }

        // ── Charge the prepaid wallet atomically ────────────────────────
        // The conditional decrement (credits >= price) inside the transaction
        // makes this safe under concurrent activations: a racing request that
        // would overdraw simply updates 0 rows and is rejected.
        try {
            const transaction = await prisma.$transaction(async (tx) => {
                const charged = await tx.user.updateMany({
                    where: { id: userId, credits: { gte: price } },
                    data: { credits: { decrement: price } },
                });
                if (charged.count === 0) {
                    throw new InsufficientCreditsError();
                }

                await tx.user.update({
                    where: { id: userId },
                    data: { activePlan: plan, planActivatedAt: new Date() },
                });

                await tx.creditTransaction.create({
                    data: {
                        userId,
                        type: "Plan_Activation",
                        amount: -price,
                        details: `Plan activation: ${plan}`,
                    },
                });

                return tx.transaction.create({
                    data: {
                        userId,
                        plan,
                        amount: price,
                        currency: "CREDITS",
                        method: "credits",
                        status: "paid",
                    },
                });
            });

            void audit({
                userId,
                action: "CREDIT_DEDUCTION",
                resourceType: "Billing",
                metadata: { plan, credits: price, reason: "plan_activation" },
                req,
            });
            void audit({
                userId,
                action: "PLAN_ACTIVATED",
                resourceType: "Billing",
                metadata: { plan, paidCredits: price, method: "credits" },
                req,
            });

            return NextResponse.json({ success: true, transaction, creditsCharged: price });
        } catch (err) {
            if (err instanceof InsufficientCreditsError) {
                return NextResponse.json(
                    { error: "Insufficient credits. Please top up your wallet.", required: price, available: user.credits },
                    { status: 402 },
                );
            }
            throw err;
        }
    } catch (error) {
        console.error("Payment activate error:", error);
        return NextResponse.json({ error: "Failed to activate plan" }, { status: 500 });
    }
}

/** Sentinel used to convert a 0-row conditional decrement into a 402. */
class InsufficientCreditsError extends Error {}

/**
 * Activate a plan with no credit charge (free trial / admin grant) and record
 * the transaction + audit trail.
 */
async function activateWithoutCharge(
    userId: string,
    plan: string,
    method: "trial" | "admin_grant",
    req: Request,
) {
    const [, transaction] = await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: { activePlan: plan, planActivatedAt: new Date() },
        }),
        prisma.transaction.create({
            data: {
                userId,
                plan,
                amount: 0,
                currency: "CREDITS",
                method,
                status: "paid",
            },
        }),
    ]);

    void audit({
        userId,
        action: "PLAN_ACTIVATED",
        resourceType: "Billing",
        metadata: { plan, paidCredits: 0, method },
        req,
    });

    return transaction;
}
