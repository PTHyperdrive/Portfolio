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

        const [user, vms, plans] = await Promise.all([
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

        return NextResponse.json({
            credits: user.credits,
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
