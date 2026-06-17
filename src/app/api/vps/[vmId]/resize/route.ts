import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { require2fa, twoFactorErrorResponse } from "@/lib/require2fa";
import { getPlanConfig, mbitToMBs } from "@/lib/plan-config";
import { getVMConfig, applyPlanHardware, resizeDisk } from "@/lib/proxmox";
import { Prisma } from "@/generated/prisma";

/**
 * POST /api/vps/[vmId]/resize — change a VM's plan (vCPU/RAM/disk).
 *
 * Body: { plan: string, totpToken?: string }
 *
 * Billing is rate-change-only: we update the VM's linked DeploymentTicket
 * planId so the hourly engine (src/app/api/billing/cycle/route.ts) bills the
 * new rate from the next tick — no upfront charge. Disk is grow-only (Proxmox
 * can't shrink). CPU/RAM apply on the next reboot unless hotplug is enabled.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ vmId: string }> },
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;
        const { vmId } = await params;

        const body = await req.json().catch(() => ({} as { plan?: string; totpToken?: string }));
        const plan = typeof body?.plan === "string" ? body.plan : "";
        if (!plan) return NextResponse.json({ error: "plan is required" }, { status: 400 });

        // Step-up: resize changes what the account is billed.
        const twoFa = await require2fa(userId, typeof body?.totpToken === "string" ? body.totpToken : undefined);
        if (!twoFa.ok) return twoFactorErrorResponse(twoFa.error!);

        const instance = await prisma.vpsInstance.findFirst({
            where: { vmId, userId },
            include: { ticket: { select: { id: true, planId: true } } },
        });
        if (!instance) return NextResponse.json({ error: "VM not found" }, { status: 404 });

        const target = getPlanConfig(plan);
        if (!target) return NextResponse.json({ error: `Unknown plan: ${plan}` }, { status: 400 });

        // GPU class can't change via resize (needs a passthrough allocation).
        const specs = (instance.specs as Record<string, unknown> | null) ?? {};
        const currentCfg = instance.ticket?.planId ? getPlanConfig(instance.ticket.planId) : null;
        const vmHasGpu = !!specs.gpu || !!currentCfg?.requiresGpu;
        if (target.requiresGpu !== vmHasGpu) {
            return NextResponse.json(
                { error: "Resize can't change the GPU class. Deploy a new instance for a different GPU tier." },
                { status: 400 },
            );
        }

        // Find the boot-disk bus + current size. Cloud-init VMs use scsi0,
        // ISO-installed VMs use sata0. Fall back to the stored spec.
        let bus = "scsi0";
        let currentDiskGb = Number(specs.disk_gb) || 0;
        try {
            const cfg = await getVMConfig(instance.node, vmId);
            bus = cfg.scsi0 ? "scsi0" : cfg.sata0 ? "sata0" : bus;
            const sizeMatch = (cfg[bus] ?? "").match(/size=(\d+)G/i);
            if (sizeMatch) currentDiskGb = parseInt(sizeMatch[1], 10);
        } catch { /* use the stored spec */ }

        if (currentDiskGb && target.diskGb < currentDiskGb) {
            return NextResponse.json(
                { error: `Disk is grow-only — ${plan} (${target.diskGb} GB) is smaller than the current ${currentDiskGb} GB.` },
                { status: 400 },
            );
        }

        // Apply CPU/RAM/bandwidth, then grow the disk if larger.
        await applyPlanHardware(instance.node, vmId, {
            cores: target.vcpu,
            memory: target.ramMb,
            net0Rate: mbitToMBs(target.bandwidthMbits) || undefined,
        });
        if (target.diskGb > currentDiskGb) {
            try { await resizeDisk(instance.node, vmId, bus, target.diskGb); }
            catch (e) { console.warn(`[resize] disk grow skipped for ${vmId}:`, e); }
        }

        // Rate change: point the metering ticket at the new plan (create one if
        // the VM has none), and refresh the stored specs.
        if (instance.ticket?.id) {
            await prisma.deploymentTicket.update({ where: { id: instance.ticket.id }, data: { planId: plan } });
        } else {
            const ticket = await prisma.deploymentTicket.create({
                data: { userId, planId: plan, status: "IN_USE", validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
            });
            await prisma.vpsInstance.update({ where: { id: instance.id }, data: { ticketId: ticket.id } });
        }
        await prisma.vpsInstance.update({
            where: { id: instance.id },
            data: {
                specs: {
                    ...specs,
                    vcpu: target.vcpu,
                    ram_gb: target.ramMb / 1024,
                    disk_gb: target.diskGb,
                    plan,
                } as Prisma.InputJsonValue,
            },
        });

        void audit({
            userId,
            action: "VM_RESIZE",
            resourceType: "VirtualMachine",
            resourceId: vmId,
            metadata: { plan, vcpu: target.vcpu, ramMb: target.ramMb, diskGb: target.diskGb },
            req,
        });

        return NextResponse.json({
            success: true,
            plan,
            specs: { vcpu: target.vcpu, ram_gb: target.ramMb / 1024, disk_gb: target.diskGb },
            note: "CPU and RAM changes take effect on the next reboot; disk growth is live.",
        });
    } catch (err) {
        console.error("[vps resize] error:", err);
        return NextResponse.json({ error: "Resize failed" }, { status: 500 });
    }
}
