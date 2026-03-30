import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * POST /api/payment/activate
 * Marks a plan as paid for the authenticated user and creates a Transaction record.
 * Body: { plan: string, amount?: number, method?: string }
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { plan, amount = 0, method = "dev_bypass" } = await req.json() as {
            plan: string;
            amount?: number;
            method?: string;
        };

        if (!plan) {
            return NextResponse.json({ error: "Plan name is required" }, { status: 400 });
        }

        // Anti-bypass guards: fetch user state from DB
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { hasUsedTrial: true, role: true, activePlan: true },
        });

        if (plan === "Trial Plan") {
            if (user?.hasUsedTrial && user.role !== "ADMIN") {
                return NextResponse.json({ error: "You have already claimed your one-time free trial." }, { status: 403 });
            }
        } else {
            // For standard plans, prevent purchasing a plan they already own
            if (user?.activePlan === plan) {
                return NextResponse.json({ error: "You already have an active subscription for this plan." }, { status: 400 });
            }
        }

        // Update user's active plan and record transaction atomically
        const [transaction] = await prisma.$transaction([
            prisma.transaction.create({
                data: {
                    userId: session.user.id,
                    plan,
                    amount,
                    method,
                    status: "paid",
                },
            }),
            prisma.user.update({
                where: { id: session.user.id },
                data: {
                    activePlan: plan,
                    planActivatedAt: new Date(),
                },
            }),
        ]);

        // ISO 27001: Audit plan activation
        void audit({
            userId: session.user.id,
            action: "PLAN_ACTIVATED",
            resourceType: "Billing",
            metadata: { plan, amount, method },
            req,
        });

        return NextResponse.json({ success: true, transaction });
    } catch (error) {
        console.error("Payment activate error:", error);
        return NextResponse.json({ error: "Failed to activate plan" }, { status: 500 });
    }
}
