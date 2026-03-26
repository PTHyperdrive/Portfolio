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
 * Deploys a VM for the user based strictly on their currently active plan.
 * Rejects if they already have an existing VM, enforcing a 1-to-1 mapping.
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        // 1. Verify user has an active plan
        const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { activePlan: true, balance: true },
        });

        if (!dbUser || !dbUser.activePlan) {
            return NextResponse.json({ error: "You do not have an active plan." }, { status: 403 });
        }

        const plan = dbUser.activePlan;

        // 2. Verify user has 0 existing VMs
        const existingVmCount = await prisma.vpsInstance.count({
            where: { userId }
        });

        if (existingVmCount > 0) {
            return NextResponse.json(
                { error: "Limit reached. Please destroy your existing VM first." },
                { status: 400 }
            );
        }

        // Parse desired ISO
        let body: Record<string, unknown> = {};
        try { body = await req.json(); } catch { /* optional body */ }
        const isoId = (body.isoId as string) || WINDOWS_ISOS[0].id;

        // ── Resolve hardware config ──────────────────────────────────
        const planCfg = getPlanConfig(plan);
        if (!planCfg) {
            return NextResponse.json({ error: `Unknown plan configuration for: ${plan}` }, { status: 400 });
        }

        // 3. Validate Wallet Credits (Skip if Free Trial)
        if (plan !== "Trial Plan" && planCfg.priceInCredits > 0) {
            if (Number(dbUser.balance) < planCfg.priceInCredits) {
                return NextResponse.json({ error: "Insufficient balance. Please top up your account." }, { status: 402 });
            }
        }

        // ── Resolve ISO ──────────────────────────────────────────────
        const iso = getIsoById(isoId) ?? WINDOWS_ISOS[0];

        // ── Smart storage selection ──────────────────────────────────
        const allPools = await getAllNodesStorage();
        const best = selectBestStorage(allPools, planCfg.storageKeyword);

        if (!best) {
            return NextResponse.json({ error: "No suitable storage pool found on any node" }, { status: 503 });
        }

        const { node, storage } = best;

        // ── Get next VMID ────────────────────────────────────────────
        const vmid = await getNextVmId();
        const vmName = `user-${userId.slice(0, 6)}-${vmid}`;
        const mac = generateMac();

        // ── Build bandwidth rate string (0 = unlimited, omit rate) ──
        const rateMBs = mbitToMBs(planCfg.bandwidthMbits);
        const net0 = rateMBs > 0
            ? `virtio=${mac},bridge=vmbr0,rate=${rateMBs}`
            : `virtio=${mac},bridge=vmbr0`;

        // ── Create VM on Proxmox ─────────────────────────────────────
        await createVM(node, {
            vmid,
            name: vmName,
            cores: planCfg.vcpu,
            sockets: 1,
            memory: planCfg.ramMb,
            cpu: "host",
            machine: "pc-q35-10.1",
            bios: "ovmf",
            efidisk0: `${storage}:1,efitype=4m,pre-enrolled-keys=1`,
            scsi0: `${storage}:${planCfg.diskGb},cache=writeback`,
            scsihw: "virtio-scsi-pci",
            ide2: `${iso.iso},media=cdrom`,
            net0,
            boot: "order=ide2;scsi0",
            vga: "qxl",
            onboot: 0,
            agent: "enabled=1,fstrim_cloned_disks=1",
        });

        // Ensure boot order is correctly set after creation
        try { await setBootOrder(node, String(vmid)); } catch { /* non-fatal */ }

        // ── Persist VpsInstance in DB ────────────────────────────────
        let service = await prisma.service.findFirst({ where: { name: plan } });
        if (!service) {
            service = await prisma.service.create({
                data: {
                    name: plan,
                    type: "VPS",
                    description: `${plan} VPS instance`,
                    price: 0,
                },
            });
        }

        // Deduct credits and log transaction 
        if (plan !== "Trial Plan" && planCfg.priceInCredits > 0) {
            await prisma.user.update({
                where: { id: userId },
                data: { balance: { decrement: planCfg.priceInCredits } },
            });
            
            await prisma.transaction.create({
                data: {
                    userId,
                    plan: plan,
                    amount: planCfg.priceInCredits,
                    currency: "Credits",
                    method: "credit_wallet",
                    status: "paid",
                }
            });
        }

        // Generate an internal order record for history tracking
        const order = await prisma.order.create({
            data: {
                userId,
                serviceId: service.id,
                status: "ACTIVE",
                totalPrice: planCfg.priceInCredits,
                notes: `Deployed via active plan: ${plan}. Deducted ${planCfg.priceInCredits} from balance.`,
            },
        });

        const expiresAt = dbUser.activePlan === "Trial Plan"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : null;

        const instance = await prisma.vpsInstance.create({
            data: {
                userId,
                orderId: order.id,
                vmId: String(vmid),
                node,
                name: vmName,
                os: iso.name,
                status: "provisioning",
                specs: {
                    vcpu: planCfg.vcpu,
                    ram_gb: planCfg.ramMb / 1024,
                    disk_gb: planCfg.diskGb,
                    storage,
                },
                expiresAt,
            },
        });

        return NextResponse.json({
            success: true,
            instance,
            vmid,
            node,
            message: `VM ${vmid} on ${node} is being deployed. It will be ready in ~60 seconds.`,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("Deploy error:", error);
        return NextResponse.json({ error: `Deployment failed: ${msg}` }, { status: 500 });
    }
}
