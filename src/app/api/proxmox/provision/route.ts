import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { startTrial } from "@/lib/trial-lifecycle";
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
 * POST /api/proxmox/provision
 * Provisions a real VM on Proxmox for the authenticated user's plan.
 * Anti-bypass: always re-reads hasUsedTrial and role from the database.
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        // ── Anti-bypass: re-read from DB, never trust session alone ──
        const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { hasUsedTrial: true, role: true },
        });

        if (!dbUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Parse optional body params
        let body: Record<string, unknown> = {};
        try { body = await req.json(); } catch { /* body is optional */ }

        const plan = (body.plan as string) || "Trial Plan";
        const isoId = (body.isoId as string) || WINDOWS_ISOS[0].id;

        // For non-Trial plans no special trial check needed.
        // For Trial plan, enforce the one-time limit (unless ADMIN).
        if (plan === "Trial Plan" && dbUser.hasUsedTrial && dbUser.role !== "ADMIN") {
            return NextResponse.json(
                { error: "Trial already used. Each account is limited to one free trial." },
                { status: 403 }
            );
        }

        // ── Resolve hardware config ──────────────────────────────────
        const planCfg = getPlanConfig(plan);
        if (!planCfg) {
            return NextResponse.json({ error: `Unknown plan: ${plan}` }, { status: 400 });
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
            // EFI disk
            efidisk0: `${storage}:1,efitype=4m,pre-enrolled-keys=1`,
            // OS disk
            scsi0: `${storage}:${planCfg.diskGb},cache=writeback`,
            scsihw: "virtio-scsi-pci",
            // CD-ROM with ISO
            ide2: `${iso.iso},media=cdrom`,
            // Network
            net0,
            // Boot from CD-ROM first
            boot: "order=ide2;scsi0",
            // Display
            vga: "qxl",
            // SPICE
            spice_enhancements: "foldersharing=0",
            // Misc
            onboot: 0,
            agent: "enabled=1,fstrim_cloned_disks=1",
        });

        // Ensure boot order is correctly set after creation
        try { await setBootOrder(node, String(vmid)); } catch { /* non-fatal */ }

        // ── Mark trial as used (for Trial Plan, non-admin) ──────────
        if (plan === "Trial Plan" && !dbUser.hasUsedTrial) {
            await startTrial(userId);
        }

        // ── Persist VpsInstance in DB ────────────────────────────────
        // Link to existing Service or create one
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

        const order = await prisma.order.create({
            data: {
                userId,
                serviceId: service.id,
                status: "ACTIVE",
                totalPrice: 0,
                notes: `Provisioned via plan: ${plan}`,
            },
        });

        const expiresAt = plan === "Trial Plan"
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
            message: `VM ${vmid} on ${node} is being provisioned. It will be ready in ~60 seconds.`,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        if (msg === "Trial already used") {
            return NextResponse.json(
                { error: "Trial already used. Each account is limited to one free trial." },
                { status: 403 }
            );
        }
        console.error("Provision error:", error);
        return NextResponse.json({ error: `Provisioning failed: ${msg}` }, { status: 500 });
    }
}
