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
 * Multi-instance, ticket-aware deployment with strict 1-to-1 ticket accounting:
 *
 *   requestedCount = body.instanceCount (1–10)
 *   ticketsToUse   = AVAILABLE tickets for plan, capped at requestedCount
 *   toCharge       = requestedCount − ticketsToUse.length
 *   totalCost      = toCharge × plan.priceInCredits
 *
 * Special planId "free-trial":
 *   – Validates user.hasUsedTrial === false (403 if already used)
 *   – Maps to "Trial Plan" config (1 vCPU, 1 GB RAM, 40 GB, free)
 *   – Sets hasUsedTrial = true in the atomic DB transaction
 *
 * The backend NEVER trusts the client's cost estimate.
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        // ── Parse body ────────────────────────────────────────────────
        let body: Record<string, unknown> = {};
        try { body = await req.json(); } catch { /* optional */ }

        const isoId          = (body.isoId         as string) || WINDOWS_ISOS[0].id;
        const requestedPlanRaw = (body.plan         as string) || "";
        const requestedCount = Math.min(
            Math.max(1, parseInt(String(body.instanceCount ?? "1"), 10) || 1),
            10  // hard cap — never trust client
        );

        // ── 0. Free-trial fast-path ───────────────────────────────────
        const isFreeTrial = requestedPlanRaw === "free-trial";

        if (isFreeTrial) {
            // Validate eligibility first — only needs hasUsedTrial
            const trialUser = await prisma.user.findUnique({
                where:  { id: userId },
                select: { hasUsedTrial: true },
            });

            if (!trialUser) {
                return NextResponse.json({ error: "User not found" }, { status: 404 });
            }

            if (trialUser.hasUsedTrial) {
                return NextResponse.json(
                    { error: "You have already used your free trial. Please choose a paid plan to continue." },
                    { status: 403 }
                );
            }
        }

        // ── 1. Resolve plan ───────────────────────────────────────────
        const dbUser = await prisma.user.findUnique({
            where:  { id: userId },
            select: { activePlan: true, credits: true, role: true },
        });

        // Admin accounts bypass payment gates: no credit deduction, no sufficiency check
        const isAdmin = dbUser?.role === "ADMIN";

        if (!dbUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Map "free-trial" frontend id → "Trial Plan" config key
        const plan = isFreeTrial
            ? "Trial Plan"
            : (requestedPlanRaw || dbUser.activePlan || "");

        if (!plan) {
            return NextResponse.json({ error: "No plan selected." }, { status: 403 });
        }

        const planCfg = getPlanConfig(plan);
        if (!planCfg) {
            return NextResponse.json({ error: `Unknown plan: ${plan}` }, { status: 400 });
        }

        // ── 2. VM limit check ─────────────────────────────────────────
        const existingVmCount = await prisma.vpsInstance.count({ where: { userId } });
        if (existingVmCount + requestedCount > 10) {
            return NextResponse.json({
                error: `Cannot deploy ${requestedCount} instances — you already have ${existingVmCount} VM(s) and the limit is 10.`,
            }, { status: 400 });
        }

        // ── 3. Ticket math (server-side, authoritative) ───────────────
        const isFree = isFreeTrial || plan === "Trial Plan" || planCfg.priceInCredits === 0;

        let ticketsToUse:   { id: string; validUntil: Date }[] = [];
        let toCharge        = requestedCount;
        let totalCost       = 0;

        if (!isFree) {
            // Fetch ALL valid available tickets for this plan, ordered soonest-expiring first
            const availableTickets = await prisma.deploymentTicket.findMany({
                where: {
                    userId,
                    planId:     plan,
                    status:     "AVAILABLE",
                    validUntil: { gt: new Date() },
                },
                orderBy: { validUntil: "asc" },
                take: requestedCount,  // never fetch more than we need
            });

            // Strict 1-to-1: each ticket covers exactly one instance
            ticketsToUse = availableTickets.slice(0, requestedCount);
            toCharge     = requestedCount - ticketsToUse.length;
            totalCost    = toCharge * planCfg.priceInCredits;

            // ── 4. Credit validation (skipped for admins) ────────────
            if (!isAdmin && totalCost > 0 && Number(dbUser.credits) < totalCost) {
                return NextResponse.json({
                    error: `Insufficient credits. Need ${totalCost.toLocaleString()}, ` +
                           `have ${Number(dbUser.credits).toLocaleString()}. ` +
                           `(${ticketsToUse.length} ticket(s) applied; ` +
                           `${toCharge} instance(s) at ${planCfg.priceInCredits.toLocaleString()} Credits each.)`,
                }, { status: 402 });
            }
        }

        // ── 5. Resolve ISO & storage ──────────────────────────────────
        const iso      = getIsoById(isoId) ?? WINDOWS_ISOS[0];
        const allPools = await getAllNodesStorage();
        // strict=true for NVMe plans — never silently fall back to HDD
        const isNvme   = planCfg.storageKeyword.toLowerCase().includes("nvme");
        const best     = selectBestStorage(allPools, planCfg.storageKeyword, isNvme);

        if (!best) {
            const poolLabel = isNvme ? "SSD-NVME-2TB" : "a suitable storage pool";
            return NextResponse.json(
                { error: `No available space on ${poolLabel}. Please try again later or contact support.` },
                { status: 503 }
            );
        }
        const { node, storage } = best;

        // ── 6. Ensure service record exists ───────────────────────────
        let service = await prisma.service.findFirst({ where: { name: plan } });
        if (!service) {
            service = await prisma.service.create({
                data: { name: plan, type: "VPS", description: `${plan} VPS`, price: 0 },
            });
        }

        const expiresAt30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // ── 7. Deploy each instance sequentially ─────────────────────
        // (Proxmox calls must be sequential to get unique VMIDs)
        const deployedVms: { vmid: number; node: string; ticketId?: string }[] = [];

        for (let i = 0; i < requestedCount; i++) {
            const vmid   = await getNextVmId();
            const vmName = `user-${userId.slice(0, 6)}-${vmid}`;
            const mac    = generateMac();
            const rateMBs = mbitToMBs(planCfg.bandwidthMbits);
            const net0    = rateMBs > 0
                ? `virtio=${mac},bridge=vmbr0,rate=${rateMBs}`
                : `virtio=${mac},bridge=vmbr0`;

            await createVM(node, {
                vmid,
                name:     vmName,
                cores:    planCfg.vcpu,
                sockets:  1,
                memory:   planCfg.ramMb,
                cpu:      "host",
                machine:  "pc-q35-10.1",
                bios:     "ovmf",
                efidisk0: `${storage}:1,efitype=4m,pre-enrolled-keys=1`,
                // SATA (AHCI) — max OS compatibility, no driver injection needed
                sata0:    `${storage}:${planCfg.diskGb},cache=writeback`,
                ide2:     `${iso.iso},media=cdrom`,
                net0,
                boot:   "order=sata0;ide2;net0",
                vga:    "qxl",
                onboot: 0,
                agent:  "enabled=1,fstrim_cloned_disks=1",
            });

            try { await setBootOrder(node, String(vmid)); } catch { /* non-fatal */ }

            deployedVms.push({ vmid, node });
        }

        // ── 8. Atomic DB transaction ──────────────────────────────────
        // Pre-create new ticket records for paid instances (need IDs before the array transaction)
        const newTickets: { id: string; validUntil: Date }[] = [];
        for (let i = 0; i < toCharge; i++) {
            const t = await prisma.deploymentTicket.create({
                data: {
                    userId,
                    planId:     plan,
                    status:     "IN_USE",
                    validUntil: expiresAt30d,
                },
            });
            newTickets.push({ id: t.id, validUntil: t.validUntil });
        }

        // Build a flat ticket list: recycled tickets first, then newly purchased ones
        const allTicketIds: ({ id: string; validUntil: Date } | null)[] = [
            ...ticketsToUse,
            ...newTickets,
        ];
        // Free/trial instances beyond ticket coverage have no ticket
        while (allTicketIds.length < requestedCount) allTicketIds.push(null);

        // Create order record
        const order = await prisma.order.create({
            data: {
                userId,
                serviceId:  service.id,
                status:     "ACTIVE",
                totalPrice: totalCost,
                notes:      `Deployed ${requestedCount}× ${plan}. Tickets used: ${ticketsToUse.length}, Charged: ${toCharge}× ${planCfg.priceInCredits} = ${totalCost} Credits.`,
            },
        });

        // Build prisma transaction operations array
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txOps: any[] = [];

        // a) Deduct credits if needed (admins are exempt)
        if (!isAdmin && totalCost > 0) {
            txOps.push(
                prisma.user.update({
                    where: { id: userId },
                    data:  { credits: { decrement: totalCost } },
                }),
                prisma.creditTransaction.create({
                    data: {
                        userId,
                        type:    "VM_Deduction",
                        amount:  -totalCost,
                        details: `Deployed ${requestedCount}× ${plan} (${toCharge} charged, ${ticketsToUse.length} ticketed)`,
                    },
                })
            );
        }

        // b) Mark hasUsedTrial = true for free trial deployments
        if (isFreeTrial) {
            txOps.push(
                prisma.user.update({
                    where: { id: userId },
                    data:  { hasUsedTrial: true },
                })
            );
        }

        // c) Consume existing tickets → set IN_USE
        for (const t of ticketsToUse) {
            txOps.push(
                prisma.deploymentTicket.update({
                    where: { id: t.id },
                    data:  { status: "IN_USE" },
                })
            );
        }

        // d) Create VpsInstance records, each linked to its ticket
        for (let i = 0; i < deployedVms.length; i++) {
            const vm     = deployedVms[i];
            const ticket = allTicketIds[i];
            txOps.push(
                prisma.vpsInstance.create({
                    data: {
                        userId,
                        orderId:   order.id,
                        vmId:      String(vm.vmid),
                        node:      vm.node,
                        name:      `user-${userId.slice(0, 6)}-${vm.vmid}`,
                        os:        iso.name,
                        status:    "provisioning",
                        ticketId:  ticket?.id ?? undefined,
                        expiresAt: ticket?.validUntil ?? expiresAt30d,
                        specs:     {
                            vcpu:           planCfg.vcpu,
                            ram_gb:         planCfg.ramMb / 1024,
                            disk_gb:        planCfg.diskGb,
                            storage,          // actual pool name e.g. "SSD-NVME-2TB"
                            storageKeyword: planCfg.storageKeyword, // for reinstall re-selection
                        },
                    },
                })
            );
        }

        await prisma.$transaction(txOps);

        return NextResponse.json({
            success:          true,
            deployed:         deployedVms.length,
            vmids:            deployedVms.map(v => v.vmid),
            node,
            ticketsUsed:      ticketsToUse.length,
            instancesCharged: isAdmin ? 0 : toCharge,
            totalCost:        isAdmin ? 0 : totalCost,
            isFreeTrial,
            isAdminDeploy:    isAdmin,
            message: `${deployedVms.length} VM(s) deployed on ${node}. ` +
                     (isAdmin
                         ? "Admin deploy — no credits deducted."
                         : `${ticketsToUse.length} ticket(s) consumed, ${toCharge} instance(s) charged (${totalCost.toLocaleString()} Credits).`),
        });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("Deploy error:", error);
        return NextResponse.json({ error: `Deployment failed: ${msg}` }, { status: 500 });
    }
}
