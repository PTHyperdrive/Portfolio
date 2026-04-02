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
    updateVMConfig,
    setBootOrder,
    generateMac,
    injectSshKey,
    triggerCloudInitRegen,
} from "@/lib/proxmox";
import { getIsoById, WINDOWS_ISOS } from "@/lib/windows-isos";
import { audit } from "@/lib/audit";
import { allocateGpu, INSUFFICIENT_GPU } from "@/lib/gpu-allocator";

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
        // strict=true for NVMe plans — prevents silently landing on HDD
        // when the SSD-NVME-2TB pool is full or offline.
        const isNvme = planCfg.storageKeyword.toLowerCase().includes("nvme");
        const best = selectBestStorage(allPools, planCfg.storageKeyword, isNvme);

        if (!best) {
            const poolLabel = isNvme ? "SSD-NVME-2TB" : "a suitable storage pool";
            return NextResponse.json(
                { error: `No available space on ${poolLabel}. Please try again later or contact support.` },
                { status: 503 }
            );
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
        const vmConfig: Record<string, string | number | boolean> = {
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
            // OS disk — SATA (AHCI): works out-of-the-box on all OSes,
            // no manual driver injection needed (unlike VirtIO SCSI).
            sata0: `${storage}:${planCfg.diskGb},cache=writeback`,
            // CD-ROM with ISO
            ide2: `${iso.iso},media=cdrom`,
            // Network
            net0,
            // Boot order: SATA disk → CD-ROM → network (PXE fallback)
            boot: "order=sata0;ide2;net0",
            // Display
            vga: "qxl",
            // Misc
            onboot: 0,
            agent: "enabled=1,fstrim_cloned_disks=1",
        };

        // ── GPU Allocation (GPU plans only) ──────────────────────────
        // Runs BEFORE the Proxmox API call so we never spin up a VM
        // that has no GPU to attach.
        let gpuAllocation: { gpuNodeId: string; pciAddress: string; label: string | null } | null = null;

        if (planCfg.requiresGpu) {
            try {
                // Atomic: allocate inside a short transaction so concurrent
                // requests cannot both pass the capacity check.
                gpuAllocation = await prisma.$transaction(async (tx) => allocateGpu(tx));

                // Add PCIe passthrough to VM config
                vmConfig["hostpci0"] = `${gpuAllocation.pciAddress},pcie=1,x-vga=1`;

                void audit({
                    userId,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    action: "VM_GPU_ALLOCATE" as any,
                    resourceType: "VirtualMachine",
                    resourceId: String(vmid),
                    metadata: {
                        gpuNodeId:  gpuAllocation.gpuNodeId,
                        pciAddress: gpuAllocation.pciAddress,
                        plan,
                    },
                    req,
                });
            } catch (err) {
                if (err instanceof Error && err.message === INSUFFICIENT_GPU) {
                    return NextResponse.json({
                        success: false,
                        error:  "All GPU nodes are currently at capacity.",
                        action: "TRIGGER_UPSELL_FLOW",
                    }, { status: 409 });
                }
                throw err; // re-throw unexpected errors
            }
        }

        await createVM(node, vmConfig);

        // Ensure boot order is correctly set after creation
        try { await setBootOrder(node, String(vmid)); } catch { /* non-fatal */ }

        // GPU plans: update VM config with the resolved pciAddress after creation
        if (gpuAllocation) {
            try {
                await updateVMConfig(node, String(vmid), {
                    hostpci0: `${gpuAllocation.pciAddress},pcie=1,x-vga=1`,
                });
            } catch { /* already set, non-fatal */ }
        }

        // ── SSH Key Injection via cloud-init ───────────────────────────
        // Fetch the user’s default SSH key (or first key if none set as default).
        // Non-fatal: VM provisions successfully either way.
        // User can add a key later — they will need to trigger cloud-init manually.
        const defaultKey = await prisma.sshKey.findFirst({
            where:   { userId, isDefault: true },
            select:  { publicKey: true },
        }) ?? await prisma.sshKey.findFirst({
            where:   { userId },
            orderBy: { createdAt: "asc" },
            select:  { publicKey: true },
        });

        if (defaultKey) {
            try {
                await injectSshKey(node, String(vmid), defaultKey.publicKey);
                await triggerCloudInitRegen(node, String(vmid));
            } catch (sshErr) {
                // Non-fatal: log but continue
                console.warn(`[provision] SSH key injection failed for VM ${vmid}:`, sshErr);
            }
        }

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const instance = await (prisma.vpsInstance.create as any)({
            data: {
                userId,
                orderId: order.id,
                vmId: String(vmid),
                node,
                name: vmName,
                os: iso.name,
                status: "provisioning",
                gpuNodeId: gpuAllocation?.gpuNodeId ?? null,
                specs: {
                    vcpu: planCfg.vcpu,
                    ram_gb: planCfg.ramMb / 1024,
                    disk_gb: planCfg.diskGb,
                    storage,
                    storageKeyword: planCfg.storageKeyword,
                    ...(gpuAllocation && {
                        gpu:        gpuAllocation.label ?? gpuAllocation.pciAddress,
                        pciAddress: gpuAllocation.pciAddress,
                        gpuNodeId:  gpuAllocation.gpuNodeId,
                    }),
                },
                expiresAt,
            },
        }) as Awaited<ReturnType<typeof prisma.vpsInstance.create>>;

        // ISO 27001: Audit VM creation
        void audit({
            userId,
            action: "VM_CREATE",
            resourceType: "VirtualMachine",
            resourceId: String(vmid),
            metadata: { node, plan, iso: iso.name, vmName },
            req,
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
