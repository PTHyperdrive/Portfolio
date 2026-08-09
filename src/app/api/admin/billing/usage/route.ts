import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { getServerPlanConfigs } from "@/lib/pricing-config";
import { resolvePeriodPrices } from "@/lib/billing-periods";

/**
 * GET /api/admin/billing/usage — Per-user metering overview (admin)
 *
 * One row per user: credit balance, live burn/hr from their running VMs,
 * runway, lifetime VM-hours + credits spent on hourly metering.
 * Powers the "Users" display mode on the admin billing page.
 */
export async function GET() {
    const { error } = await requireAdmin();
    if (error) return error;

    try {
        const [users, plans, hourlyTxns] = await Promise.all([
            prisma.user.findMany({
                select: {
                    id: true, name: true, email: true, role: true,
                    credits: true, activePlan: true,
                    vpsInstances: {
                        select: { status: true, ticket: { select: { planId: true } } },
                    },
                },
                orderBy: { createdAt: "desc" },
            }),
            getServerPlanConfigs(),
            prisma.creditTransaction.findMany({
                where: { type: "Hourly_Usage" },
                select: { userId: true, amount: true, details: true },
            }),
        ]);

        // Lifetime VM-hours + spend per user from the metering ledger
        const usage = new Map<string, { spent: number; vmHours: number }>();
        for (const txn of hourlyTxns) {
            const u = usage.get(txn.userId) ?? { spent: 0, vmHours: 0 };
            u.spent -= txn.amount;
            const m = txn.details?.match(/(\d+) running VM/);
            u.vmHours += m ? parseInt(m[1], 10) : 1;
            usage.set(txn.userId, u);
        }

        const rows = users.map((u) => {
            const burnPerHour = u.vpsInstances.reduce((sum, vm) => {
                if (vm.status !== "running") return sum;
                const planName = vm.ticket?.planId ?? u.activePlan;
                const cfg = planName ? plans[planName] : null;
                return sum + (cfg ? resolvePeriodPrices(cfg).hourly : 0);
            }, 0);
            const lifetime = usage.get(u.id) ?? { spent: 0, vmHours: 0 };

            return {
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                credits: u.credits,
                activePlan: u.activePlan,
                vmCount: u.vpsInstances.length,
                runningVms: u.vpsInstances.filter((v) => v.status === "running").length,
                burnPerHour,
                runwayHours: burnPerHour > 0 ? Math.floor(u.credits / burnPerHour) : null,
                totalVmHours: lifetime.vmHours,
                totalHourlySpent: lifetime.spent,
            };
        });

        return NextResponse.json({ users: rows });
    } catch (err) {
        console.error("[GET /api/admin/billing/usage]", err);
        return NextResponse.json({ error: "Failed to load usage" }, { status: 500 });
    }
}
