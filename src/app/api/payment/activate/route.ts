import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getServerPlanConfig } from "@/lib/pricing-config";
import { hourlyBurnRate } from "@/lib/billing-periods";

/**
 * POST /api/payment/activate
 * Selects a plan for the authenticated user. NO upfront charge — the
 * platform bills hourly via /api/billing/cycle while VMs are running.
 * Activation just records which plan the user is on.
 *
 * Body: { plan: string }
 *   - Plan must exist in the server-side catalog (admin overrides applied).
 *   - "Trial Plan" remains one-time per user.
 *   - Price-0 non-trial plans (e.g. Operator-Exclusive) stay admin-only.
 *   - Requires enough credits for at least 1 hour of the plan's burn rate,
 *     so users can't select plans they can't run at all.
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

        if (plan === "Trial Plan" && user.hasUsedTrial && !isAdmin) {
            return NextResponse.json(
                { error: "You have already claimed your one-time free trial." },
                { status: 403 },
            );
        }

        const hourly = hourlyBurnRate(planConfig);

        // Special plans (hourly 0, non-trial) are admin-assigned only.
        if (plan !== "Trial Plan" && hourly <= 0 && !isAdmin) {
            return NextResponse.json(
                { error: "This plan is not available for self-service activation." },
                { status: 403 },
            );
        }

        // Sanity floor: at least one hour of runtime must be affordable.
        if (!isAdmin && hourly > 0 && user.credits < hourly) {
            return NextResponse.json(
                { error: "Insufficient credits for even one hour. Please top up.", requiredPerHour: hourly, available: user.credits },
                { status: 402 },
            );
        }

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
                    method: "hourly_metered",
                    status: "paid",
                },
            }),
        ]);

        void audit({
            userId,
            action: "PLAN_ACTIVATED",
            resourceType: "Billing",
            metadata: { plan, billing: "hourly_metered", hourlyRate: hourly },
            req,
        });

        return NextResponse.json({ success: true, transaction, hourlyRate: hourly });
    } catch (error) {
        console.error("Payment activate error:", error);
        return NextResponse.json({ error: "Failed to activate plan" }, { status: 500 });
    }
}
