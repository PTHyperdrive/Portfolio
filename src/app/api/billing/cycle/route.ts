import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { stopVM } from "@/lib/proxmox";
import { getServerPlanConfigs } from "@/lib/pricing-config";
import { resolvePeriodPrices } from "@/lib/billing-periods";

/**
 * POST /api/billing/cycle — Hourly metered billing engine
 *
 * Called once per hour by server.mjs (or external cron). Protected by the
 * BILLING_CRON_SECRET header — not a user-facing endpoint.
 *
 * For every RUNNING VpsInstance:
 *   1. Resolve its plan's hourly price (ticket.planId → owner's activePlan)
 *   2. Conditionally deduct from the owner's credits (no overdraw)
 *   3. If the owner can't pay → stop all their running VMs ("suspended")
 *
 * Idempotency: a SystemConfig timestamp gate skips runs <55 min apart, so
 * an overlapping cron or manual trigger can't double-charge an hour.
 */

const GATE_KEY = "last_billing_cycle_at";
const MIN_INTERVAL_MS = 55 * 60 * 1000;

export async function POST(req: NextRequest) {
    const secret = process.env.BILLING_CRON_SECRET;
    if (!secret || req.headers.get("x-billing-cron-secret") !== secret) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        // ── Idempotency gate ─────────────────────────────────────────
        const gate = await prisma.systemConfig.findUnique({ where: { key: GATE_KEY } });
        const lastRun = gate ? new Date(gate.value).getTime() : 0;
        if (Date.now() - lastRun < MIN_INTERVAL_MS) {
            return NextResponse.json({ status: "skipped", reason: "ran recently" });
        }
        await prisma.systemConfig.upsert({
            where: { key: GATE_KEY },
            update: { value: new Date().toISOString() },
            create: { key: GATE_KEY, value: new Date().toISOString() },
        });

        const [plans, running] = await Promise.all([
            getServerPlanConfigs(),
            prisma.vpsInstance.findMany({
                where: { status: "running" },
                select: {
                    id: true, vmId: true, node: true, userId: true,
                    ticket: { select: { planId: true } },
                    user: { select: { activePlan: true, role: true } },
                },
            }),
        ]);

        // Group hourly burn per user (one wallet → one deduction)
        const byUser = new Map<string, { burn: number; vms: typeof running }>();
        for (const vm of running) {
            if (vm.user.role === "ADMIN") continue; // admins aren't metered
            const planName = vm.ticket?.planId ?? vm.user.activePlan;
            const cfg = planName ? plans[planName] : null;
            const hourly = cfg ? resolvePeriodPrices(cfg).hourly : 0;
            if (hourly <= 0) continue;
            const entry = byUser.get(vm.userId) ?? { burn: 0, vms: [] };
            entry.burn += hourly;
            entry.vms.push(vm);
            byUser.set(vm.userId, entry);
        }

        let charged = 0, suspended = 0;

        for (const [userId, { burn, vms }] of byUser) {
            // Conditional decrement — never overdraws under concurrency
            const ok = await prisma.user.updateMany({
                where: { id: userId, credits: { gte: burn } },
                data: { credits: { decrement: burn } },
            });

            if (ok.count === 1) {
                charged++;
                await prisma.creditTransaction.create({
                    data: {
                        userId,
                        type: "Hourly_Usage",
                        amount: -burn,
                        details: `Hourly metering: ${vms.length} running VM(s)`,
                    },
                });
                continue;
            }

            // ── Insufficient credits → suspend (stop) their VMs ─────
            suspended++;
            for (const vm of vms) {
                try { await stopVM(vm.node, vm.vmId); } catch { /* already off / unreachable */ }
                await prisma.vpsInstance.update({
                    where: { id: vm.id },
                    data: { status: "suspended" },
                });
                void audit({
                    userId,
                    action: "VM_STOP",
                    resourceType: "VirtualMachine",
                    resourceId: vm.vmId,
                    outcome: "SUCCESS",
                    metadata: { reason: "credits_exhausted", node: vm.node },
                });
            }
            void audit({
                userId,
                action: "CREDIT_DEDUCTION",
                resourceType: "Billing",
                outcome: "FAILED",
                metadata: { reason: "insufficient_credits_suspended", required: burn, vms: vms.length },
            });
        }

        return NextResponse.json({
            status: "completed",
            usersCharged: charged,
            usersSuspended: suspended,
            runningVms: running.length,
        });
    } catch (err) {
        console.error("[billing/cycle]", err);
        return NextResponse.json({ error: "Billing cycle failed" }, { status: 500 });
    }
}
