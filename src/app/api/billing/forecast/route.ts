import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getServerPlanConfigs } from "@/lib/pricing-config";
import { resolvePeriodPrices, PERIOD_HOURS } from "@/lib/billing-periods";

/**
 * GET /api/billing/forecast
 *
 * Usage forecast for the authenticated user, based on their RUNNING VMs'
 * plan burn rates (stopped VMs don't burn):
 *   - burn per hour/day/week/month
 *   - credit runway (hours/days until zero) + projected depletion date
 *   - per-VM breakdown so users see what's eating credits
 *
 * Plan resolution per VM: DeploymentTicket.planId → user's activePlan.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [user, vms, plans, hourlySpent] = await Promise.all([
            prisma.user.findUnique({
                where: { id: session.user.id },
                select: { credits: true, activePlan: true },
            }),
            prisma.vpsInstance.findMany({
                where: { userId: session.user.id },
                select: {
                    id: true, vmId: true, name: true, status: true,
                    ticket: { select: { planId: true } },
                },
            }),
            getServerPlanConfigs(),
            prisma.creditTransaction.findMany({
                where: { userId: session.user.id, type: "Hourly_Usage" },
                select: { amount: true, details: true },
            }),
        ]);

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const breakdown = vms.map((vm) => {
            const planName = vm.ticket?.planId ?? user.activePlan ?? null;
            const cfg = planName ? plans[planName] : null;
            const hourly = cfg ? resolvePeriodPrices(cfg).hourly : 0;
            const running = vm.status === "running";
            return {
                vmId: vm.vmId,
                name: vm.name,
                plan: planName,
                status: vm.status,
                burnPerHour: running ? hourly : 0,
            };
        });

        const burnPerHour = breakdown.reduce((sum, b) => sum + b.burnPerHour, 0);

        const runwayHours = burnPerHour > 0 ? user.credits / burnPerHour : null;
        const depletionAt = runwayHours !== null
            ? new Date(Date.now() + runwayHours * 3_600_000).toISOString()
            : null;

        // Lifetime totals from the metering ledger. Each cycle txn records
        // "Hourly metering: N running VM(s)" — N VM-hours billed that hour.
        const totalHourlySpent = hourlySpent.reduce((s, r) => s - r.amount, 0);
        const totalVmHours = hourlySpent.reduce((s, r) => {
            const m = r.details?.match(/(\d+) running VM/);
            return s + (m ? parseInt(m[1], 10) : 1);
        }, 0);

        return NextResponse.json({
            credits: user.credits,
            totalHourlySpent,
            // Cumulative billed VM-hours (2 VMs for 1h = 2 VM-hours)
            totalVmHours,
            burn: {
                hourly: burnPerHour,
                daily: burnPerHour * PERIOD_HOURS.daily,
                weekly: burnPerHour * PERIOD_HOURS.weekly,
                monthly: burnPerHour * PERIOD_HOURS.monthly,
            },
            runway: {
                hours: runwayHours !== null ? Math.floor(runwayHours) : null,
                days: runwayHours !== null ? Math.floor(runwayHours / 24) : null,
                depletionAt,
            },
            vms: breakdown,
        });
    } catch (err) {
        console.error("[GET /api/billing/forecast]", err);
        return NextResponse.json({ error: "Forecast failed" }, { status: 500 });
    }
}
