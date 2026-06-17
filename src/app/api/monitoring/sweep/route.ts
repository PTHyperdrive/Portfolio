import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getVMStatus } from "@/lib/proxmox";
import { sendMail, mailerConfigured } from "@/lib/mailer";
import { audit } from "@/lib/audit";

/**
 * POST /api/monitoring/sweep — evaluate VM alert rules and fire notifications.
 *
 * Called on an interval by server.mjs (protected by MONITORING_CRON_SECRET).
 * For each enabled rule whose VM is running, polls the VM's Proxmox status,
 * computes the metric, and on a breach creates an in-app Notification (+ email),
 * rate-limited per rule by lastFiredAt. Bandwidth is a rate derived from the
 * netin/netout deltas stored on the rule between sweeps.
 */

const COOLDOWN_MS = 60 * 60 * 1000; // one alert per rule per hour
const METRIC_LABEL: Record<string, string> = { cpu: "CPU", mem: "Memory", disk: "Disk", bandwidth: "Bandwidth" };

export async function POST(req: NextRequest) {
    const secret = process.env.MONITORING_CRON_SECRET;
    if (!secret || req.headers.get("x-monitoring-cron-secret") !== secret) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rules = await prisma.vmAlertRule.findMany({
        where: { enabled: true },
        include: { user: { select: { email: true } } },
    });

    const statusCache = new Map<string, Record<string, unknown> | null>();
    const now = Date.now();
    let evaluated = 0, fired = 0;

    for (const rule of rules) {
        const key = `${rule.node}/${rule.vmId}`;
        if (!statusCache.has(key)) {
            try { statusCache.set(key, (await getVMStatus(rule.node, rule.vmId)) as Record<string, unknown>); }
            catch { statusCache.set(key, null); }
        }
        const raw = statusCache.get(key);
        if (!raw || raw.status !== "running") continue;
        evaluated++;

        const num = (k: string) => Number(raw[k] ?? 0);
        let value: number | null = null;

        if (rule.metric === "cpu") {
            value = num("cpu") * 100;
        } else if (rule.metric === "mem") {
            const max = num("maxmem"); value = max > 0 ? (num("mem") / max) * 100 : null;
        } else if (rule.metric === "disk") {
            const max = num("maxdisk"); value = max > 0 ? (num("disk") / max) * 100 : null;
        } else if (rule.metric === "bandwidth") {
            const total = num("netin") + num("netout");
            if (rule.lastValueAt) {
                const dt = (now - rule.lastValueAt.getTime()) / 1000;
                value = dt > 0 ? ((total - (rule.lastValue ?? total)) * 8) / dt / 1e6 : null;
            }
            await prisma.vmAlertRule.update({ where: { id: rule.id }, data: { lastValue: total, lastValueAt: new Date() } });
        }

        if (value === null) continue;

        const breach = rule.comparison === "lt" ? value < rule.threshold : value > rule.threshold;
        if (!breach) continue;
        if (rule.lastFiredAt && now - rule.lastFiredAt.getTime() < COOLDOWN_MS) continue;

        const unit = rule.metric === "bandwidth" ? " Mbps" : "%";
        const label = METRIC_LABEL[rule.metric] ?? rule.metric;
        const title = `${label} alert — VM #${rule.vmId}`;
        const body = `${label} is ${value.toFixed(1)}${unit} (${rule.comparison === "lt" ? "below" : "above"} ${rule.threshold}${unit}).`;

        await prisma.notification.create({
            data: { userId: rule.userId, type: "alert", title, body, link: `/dashboard/vps/${rule.vmId}?node=${rule.node}` },
        });
        await prisma.vmAlertRule.update({ where: { id: rule.id }, data: { lastFiredAt: new Date() } });
        fired++;

        if (mailerConfigured() && rule.user.email) {
            void sendMail({ to: rule.user.email, subject: `[NotRespond] ${title}`, text: `${body}\n\nView: /dashboard/vps/${rule.vmId}` }).catch(() => {});
        }
        void audit({
            userId: rule.userId,
            action: "ALERT_FIRED",
            resourceType: "VirtualMachine",
            resourceId: rule.vmId,
            metadata: { metric: rule.metric, value: Number(value.toFixed(2)), threshold: rule.threshold, comparison: rule.comparison },
        });
    }

    return NextResponse.json({ status: "completed", rules: rules.length, evaluated, fired });
}
