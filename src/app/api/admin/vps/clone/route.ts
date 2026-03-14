import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
    cloneVM,
    pollTask,
    setCloudInit,
    startVM,
    getNextVMID,
    type CloudInitConfig,
} from "@/lib/proxmox";

/**
 * POST /api/admin/vps/clone
 *
 * Full VPS provisioning pipeline (admin only):
 *   cloneVM → pollTask → setCloudInit → startVM → prisma.vpsInstance.create
 *
 * Body:
 * {
 *   node:          string   — Proxmox node (e.g. "pve1")
 *   templateId:    number   — VMID of the Cloud-Init template to clone
 *   newVmId?:      number   — Desired VMID; omit to auto-allocate via cluster/nextid
 *   name:          string   — Friendly VM name
 *   storage:       string   — Target storage pool (e.g. "local-lvm")
 *   ipConfig:      string   — Cloud-Init IP string: "ip=dhcp" or "ip=10.0.1.50/24,gw=10.0.1.1"
 *   ciUser?:       string   — Linux user to create
 *   ciPassword?:   string   — Password for ciUser
 *   sshKey?:       string   — Public SSH key
 *   nameserver?:   string   — DNS servers e.g. "1.1.1.1 8.8.8.8"
 *   searchdomain?: string   — DNS search domain
 *   assignUserId?: string   — DB user ID to assign the instance to (defaults to requester)
 *   osLabel?:      string   — Display label e.g. "Ubuntu 24.04"
 *   cores?:        number   — vCPUs (for DB record; template specs are inherited)
 *   memoryMb?:     number   — RAM MB (for DB record)
 *   diskGb?:       number   — Disk GB (for DB record)
 *   cloneTimeoutMs?: number — Max ms to wait for clone task (default 120 000)
 * }
 */
export async function POST(req: NextRequest) {
    try {
        // ── Auth ───────────────────────────────────────────────────
        const session = await auth();
        if ((session?.user as { role?: string })?.role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        // ── Parse & Validate Body ──────────────────────────────────
        const body = await req.json();
        const {
            node,
            templateId,
            newVmId,
            name,
            storage,
            ipConfig,
            ciUser,
            ciPassword,
            sshKey,
            nameserver,
            searchdomain,
            assignUserId,
            osLabel,
            cores,
            memoryMb,
            diskGb,
            cloneTimeoutMs = 120_000,
        } = body as {
            node: string;
            templateId: number;
            newVmId?: number;
            name: string;
            storage: string;
            ipConfig: string;
            ciUser?: string;
            ciPassword?: string;
            sshKey?: string;
            nameserver?: string;
            searchdomain?: string;
            assignUserId?: string;
            osLabel?: string;
            cores?: number;
            memoryMb?: number;
            diskGb?: number;
            cloneTimeoutMs?: number;
        };

        if (!node || !templateId || !name || !storage || !ipConfig) {
            return NextResponse.json(
                { error: "node, templateId, name, storage, ipConfig are required" },
                { status: 400 }
            );
        }

        // ── Resolve VMID ───────────────────────────────────────────
        const vmId: number = newVmId ?? Number(await getNextVMID());

        // ── Step 1: Clone the template ─────────────────────────────
        console.log(`[clone_vps] Cloning template ${templateId} → VM ${vmId} on ${node}`);
        const upid = await cloneVM(node, templateId, vmId, name, storage);
        console.log(`[clone_vps] Clone task started — UPID: ${upid}`);

        // ── Step 2: Wait for clone to finish (UPID polling) ────────
        await pollTask(node, upid, cloneTimeoutMs);
        console.log(`[clone_vps] Clone task completed — VM ${vmId} ready`);

        // ── Step 3: Apply Cloud-Init configuration ─────────────────
        const cloudInitConfig: CloudInitConfig = {
            ipConfig,
            ciUser,
            ciPassword,
            sshKey,
            nameserver,
            searchdomain,
        };
        await setCloudInit(node, vmId, cloudInitConfig);
        console.log(`[clone_vps] Cloud-Init config applied to VM ${vmId}`);

        // ── Step 4: Start the VM ───────────────────────────────────
        await startVM(node, vmId.toString());
        console.log(`[clone_vps] VM ${vmId} started`);

        // ── Step 5: Persist to database ────────────────────────────
        const userId = assignUserId ?? session!.user!.id!;

        // Resolve or create an ACTIVE order for this user
        let orderId: string;
        const existingOrder = await prisma.order.findFirst({
            where: { userId, status: "ACTIVE" },
            select: { id: true },
        });

        if (existingOrder) {
            orderId = existingOrder.id;
        } else {
            // Find or lazily create a default VPS service product
            let service = await prisma.service.findFirst({
                where: { type: "VPS", active: true },
                select: { id: true },
            });
            if (!service) {
                service = await prisma.service.create({
                    data: {
                        name: "Admin VPS",
                        type: "VPS",
                        description: "Admin-provisioned VPS instance",
                        price: 0,
                        active: true,
                    },
                    select: { id: true },
                });
            }
            const order = await prisma.order.create({
                data: {
                    userId,
                    serviceId: service.id,
                    status: "ACTIVE",
                    totalPrice: 0,
                    notes: "Admin-provisioned via clone",
                },
            });
            orderId = order.id;
        }

        // Extract the IP address from ipConfig for display
        const ipMatch = ipConfig.match(/ip=([^,/]+)/);
        const ip = ipMatch?.[1] === "dhcp" ? "DHCP" : (ipMatch?.[1] ?? "unknown");

        const instance = await prisma.vpsInstance.create({
            data: {
                userId,
                orderId,
                vmId: vmId.toString(),
                node,
                name,
                os: osLabel ?? "Linux",
                status: "running",
                specs: {
                    vcpu:    cores    ?? 0,
                    ram_gb:  memoryMb ? Math.round(memoryMb / 1024) : 0,
                    disk_gb: diskGb   ?? 0,
                },
            },
        });

        return NextResponse.json({
            success: true,
            vmid: vmId,
            instanceId: instance.id,
            ip,
            message: `VM "${name}" (${vmId}) cloned from template ${templateId}, Cloud-Init applied, started on ${node}.`,
        });

    } catch (error) {
        console.error("[clone_vps] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "VPS provisioning failed" },
            { status: 500 }
        );
    }
}
