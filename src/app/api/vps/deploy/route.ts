import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPlanConfig, mbitToMBs } from "@/lib/plan-config";
import {
    getAllNodesStorage,
    selectBestStorage,
    getNextVmId,
    createVM,
    setBootOrder,
    generateMac,
} from "@/lib/proxmox";
import { getIsoById, WINDOWS_ISOS } from "@/lib/windows-isos";

/**
 * POST /api/vps/deploy
 *
 * Ticket-first deployment flow:
 *  1. Check for an AVAILABLE DeploymentTicket for the requested plan.
 *     • If found → deploy free, mark ticket IN_USE, link VM to ticket.
 *  2. If no valid ticket → deduct credits, create a new ticket (30-day), mark IN_USE, link VM.
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        // Parse body
        let body: Record<string, unknown> = {};
        try { body = await req.json(); } catch { /* optional */ }

        const isoId      = (body.isoId  as string) || WINDOWS_ISOS[0].id;
        const requestedPlan = (body.plan as string) || "";

        // ── 1. Resolve the target plan ────────────────────────────────
        const dbUser = await prisma.user.findUnique({
            where:  { id: userId },
            select: { activePlan: true, credits: true },
        });

        if (!dbUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Allow the UI to pass an explicit plan; fall back to activePlan
        const plan = requestedPlan || dbUser.activePlan || "";

        if (!plan) {
            return NextResponse.json({ error: "No plan selected and no active plan on account." }, { status: 403 });
        }

        const planCfg = getPlanConfig(plan);
        if (!planCfg) {
            return NextResponse.json({ error: `Unknown plan: ${plan}` }, { status: 400 });
        }

        // ── 2. Check VM limit (1 per user) ───────────────────────────
        const existingVmCount = await prisma.vpsInstance.count({ where: { userId } });
        if (existingVmCount > 0) {
            return NextResponse.json({ error: "Limit reached. Destroy your existing VM first." }, { status: 400 });
        }

        // ── 3. Ticket check ──────────────────────────────────────────
        let usingTicket: { id: string; validUntil: Date } | null = null;

        if (plan !== "Trial Plan" && planCfg.priceInCredits > 0) {
            const availableTicket = await prisma.deploymentTicket.findFirst({
                where: {
                    userId,
                    planId:     plan,
                    status:     "AVAILABLE",
                    validUntil: { gt: new Date() },
                },
                orderBy: { validUntil: "asc" }, // consume soonest-expiring first
            });

            if (availableTicket) {
                // ── Use existing ticket (free re-deploy) ────────────
                usingTicket = availableTicket;
            } else {
                // ── Buy a new ticket: verify credits ─────────────────
                if (Number(dbUser.credits) < planCfg.priceInCredits) {
                    return NextResponse.json({
                        error: `Insufficient credits. Need ${planCfg.priceInCredits.toLocaleString()}, have ${Number(dbUser.credits).toLocaleString()}.`,
                    }, { status: 402 });
                }
            }
        }

        // ── 4. Resolve ISO & storage ─────────────────────────────────
        const iso      = getIsoById(isoId) ?? WINDOWS_ISOS[0];
        const allPools = await getAllNodesStorage();
        const best     = selectBestStorage(allPools, planCfg.storageKeyword);

        if (!best) {
            return NextResponse.json({ error: "No suitable storage pool found." }, { status: 503 });
        }

        const { node, storage } = best;
        const vmid   = await getNextVmId();
        const vmName = `user-${userId.slice(0, 6)}-${vmid}`;
        const mac    = generateMac();
        const rateMBs = mbitToMBs(planCfg.bandwidthMbits);
        const net0    = rateMBs > 0
            ? `virtio=${mac},bridge=vmbr0,rate=${rateMBs}`
            : `virtio=${mac},bridge=vmbr0`;

        // ── 5. Create VM on Proxmox ──────────────────────────────────
        await createVM(node, {
            vmid,
            name:    vmName,
            cores:   planCfg.vcpu,
            sockets: 1,
            memory:  planCfg.ramMb,
            cpu:     "host",
            machine: "pc-q35-10.1",
            bios:    "ovmf",
            efidisk0: `${storage}:1,efitype=4m,pre-enrolled-keys=1`,
            scsi0:    `${storage}:${planCfg.diskGb},cache=writeback`,
            scsihw:   "virtio-scsi-pci",
            ide2:     `${iso.iso},media=cdrom`,
            net0,
            boot:   "order=ide2;scsi0",
            vga:    "qxl",
            onboot: 0,
            agent:  "enabled=1,fstrim_cloned_disks=1",
        });

        try { await setBootOrder(node, String(vmid)); } catch { /* non-fatal */ }

        // ── 6. DB writes (atomic transaction) ────────────────────────
        let service = await prisma.service.findFirst({ where: { name: plan } });
        if (!service) {
            service = await prisma.service.create({
                data: { name: plan, type: "VPS", description: `${plan} VPS`, price: 0 },
            });
        }

        const order = await prisma.order.create({
            data: {
                userId,
                serviceId:  service.id,
                status:     "ACTIVE",
                totalPrice: usingTicket ? 0 : planCfg.priceInCredits,
                notes:      usingTicket
                    ? `Re-deploy using ticket ${usingTicket.id} (valid until ${usingTicket.validUntil.toISOString()}).`
                    : `Deployed ${plan}. Deducted ${planCfg.priceInCredits} credits.`,
            },
        });

        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        if (usingTicket) {
            // Consume existing ticket — mark IN_USE and create VM linked to it
            await prisma.$transaction([
                prisma.deploymentTicket.update({
                    where: { id: usingTicket.id },
                    data:  { status: "IN_USE" },
                }),
                prisma.vpsInstance.create({
                    data: {
                        userId,
                        orderId:  order.id,
                        vmId:     String(vmid),
                        node,
                        name:     vmName,
                        os:       iso.name,
                        status:   "provisioning",
                        ticketId: usingTicket.id,
                        specs:    { vcpu: planCfg.vcpu, ram_gb: planCfg.ramMb / 1024, disk_gb: planCfg.diskGb, storage },
                        expiresAt: usingTicket.validUntil,
                    },
                }),
            ]);
        } else if (plan !== "Trial Plan" && planCfg.priceInCredits > 0) {
            // Create new ticket, deduct credits, create VM — all atomic
            const ticket = await prisma.deploymentTicket.create({
                data: {
                    userId,
                    planId:     plan,
                    status:     "IN_USE",
                    validUntil: expiresAt,
                },
            });

            await prisma.$transaction([
                prisma.user.update({
                    where: { id: userId },
                    data:  { credits: { decrement: planCfg.priceInCredits } },
                }),
                prisma.creditTransaction.create({
                    data: {
                        userId,
                        type:    "VM_Deduction",
                        amount:  -planCfg.priceInCredits,
                        details: `Deployed ${plan} (VM #${vmid})`,
                    },
                }),
                prisma.vpsInstance.create({
                    data: {
                        userId,
                        orderId:  order.id,
                        vmId:     String(vmid),
                        node,
                        name:     vmName,
                        os:       iso.name,
                        status:   "provisioning",
                        ticketId: ticket.id,
                        specs:    { vcpu: planCfg.vcpu, ram_gb: planCfg.ramMb / 1024, disk_gb: planCfg.diskGb, storage },
                        expiresAt,
                    },
                }),
            ]);
        } else {
            // Trial / free plan — no ticket, no deduction
            await prisma.vpsInstance.create({
                data: {
                    userId,
                    orderId: order.id,
                    vmId:    String(vmid),
                    node,
                    name:    vmName,
                    os:      iso.name,
                    status:  "provisioning",
                    specs:   { vcpu: planCfg.vcpu, ram_gb: planCfg.ramMb / 1024, disk_gb: planCfg.diskGb, storage },
                    expiresAt,
                },
            });
        }

        return NextResponse.json({
            success: true,
            vmid,
            node,
            usedTicket: !!usingTicket,
            message: usingTicket
                ? `VM #${vmid} deployed on ${node} using your existing ticket (no credits charged).`
                : `VM #${vmid} deployed on ${node}. ${planCfg.priceInCredits.toLocaleString()} credits deducted.`,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("Deploy error:", error);
        return NextResponse.json({ error: `Deployment failed: ${msg}` }, { status: 500 });
    }
}
