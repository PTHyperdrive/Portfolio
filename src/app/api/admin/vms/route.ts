import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
    createVM,
    getNextVMID,
    listPVENodes,
    listISOs,
    listStorages,
    listNodeVMs,
} from "@/lib/proxmox";

/**
 * GET /api/admin/vms — List Proxmox cluster info (nodes, ISOs, storages, all VMs)
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if ((session?.user as { role?: string })?.role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const action = req.nextUrl.searchParams.get("action");
        const node = req.nextUrl.searchParams.get("node") || "";

        switch (action) {
            case "nodes": {
                const nodes = await listPVENodes();
                return NextResponse.json({ nodes });
            }
            case "isos": {
                if (!node) return NextResponse.json({ error: "node required" }, { status: 400 });
                const storage = req.nextUrl.searchParams.get("storage") || "local";
                const isos = await listISOs(node, storage);
                return NextResponse.json({ isos });
            }
            case "storages": {
                if (!node) return NextResponse.json({ error: "node required" }, { status: 400 });
                const storages = await listStorages(node);
                return NextResponse.json({ storages });
            }
            case "list-vms": {
                if (!node) return NextResponse.json({ error: "node required" }, { status: 400 });
                const vms = await listNodeVMs(node);
                return NextResponse.json({ vms });
            }
            case "nextid": {
                const nextId = await getNextVMID();
                return NextResponse.json({ nextId });
            }
            default: {
                // Return all user accounts for the "assign to" dropdown
                const users = await prisma.user.findMany({
                    select: { id: true, name: true, email: true, role: true },
                    orderBy: { email: "asc" },
                });
                return NextResponse.json({ users });
            }
        }
    } catch (error) {
        console.error("Admin VMs GET error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/vms — Create a new VM on Proxmox and assign to a user
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if ((session?.user as { role?: string })?.role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const body = await req.json();
        const {
            node,
            name,
            cores,
            memory, // in MB
            diskSize, // in GB
            diskStorage, // e.g. "local-lvm"
            iso,  // e.g. "local:iso/Win11.iso"
            osLabel, // Display label like "Windows 11"
            network, // e.g. "virtio,bridge=vmbr0"
            assignUserId, // User to assign this VM to
            ostype, // e.g. "win11", "l26"
            bios, // "ovmf" or "seabios"
        } = body;

        if (!node || !name || !cores || !memory) {
            return NextResponse.json({ error: "node, name, cores, memory are required" }, { status: 400 });
        }

        // Get next available VMID — enforce minimum of 150 so customer VMs
        // never clash with existing infra nodes (IDs 100-149 are reserved)
        let vmid = parseInt(await getNextVMID());
        if (vmid < 150) vmid = 150;

        // Build Proxmox VM config
        const vmConfig: Record<string, unknown> = {
            vmid: vmid,
            name,
            cores,
            memory,
            sockets: 1,
            cpu: "host",
            ostype: ostype || "other",
            scsihw: "virtio-scsi-single",
            net0: network || "virtio,bridge=vmbr0",
            agent: "1",
        };

        // Disk
        if (diskSize && diskStorage) {
            vmConfig.scsi0 = `${diskStorage}:${diskSize}`;
        }

        // ISO
        if (iso) {
            vmConfig.ide2 = `${iso},media=cdrom`;
            vmConfig.boot = "order=ide2;scsi0";
        } else {
            vmConfig.boot = "order=scsi0";
        }

        // BIOS / EFI
        if (bios === "ovmf") {
            vmConfig.bios = "ovmf";
            vmConfig.machine = "q35";
            if (diskStorage) {
                vmConfig.efidisk0 = `${diskStorage}:1`;
            }
        }

        // Create VM on Proxmox
        await createVM(node, vmConfig as any);

        // Create VpsInstance in our database and assign to a user
        const userId = assignUserId || session!.user!.id;

        // Create a pseudo-order for the admin-created VM
        let orderId: string;
        const existingOrder = await prisma.order.findFirst({
            where: { userId, status: "ACTIVE" },
            select: { id: true },
        });

        if (existingOrder) {
            orderId = existingOrder.id;
        } else {
            // Find or create a default VPS service
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
                    notes: "Admin-provisioned",
                },
            });
            orderId = order.id;
        }

        // Upsert the VpsInstance to avoid Prisma unique constraint crash
        // when an admin retries after a partial failure (VM exists on PVE but
        // the DB write previously failed).  vmId + node is the natural key.
        const instance = await prisma.vpsInstance.upsert({
            where: {
                vmId_node: { vmId: vmid.toString(), node },
            },
            update: {
                name,
                os: osLabel || "Unknown OS",
                status: "stopped",
                specs: {
                    vcpu: cores,
                    ram_gb: Math.round(memory / 1024),
                    disk_gb: diskSize || 0,
                },
            },
            create: {
                userId,
                orderId,
                vmId: vmid.toString(),
                node,
                name,
                os: osLabel || "Unknown OS",
                status: "stopped",
                specs: {
                    vcpu: cores,
                    ram_gb: Math.round(memory / 1024),
                    disk_gb: diskSize || 0,
                },
            },
        });

        return NextResponse.json({
            success: true,
            vmid,
            instanceId: instance.id,
            message: `VM ${name} (${vmid}) created on ${node} and assigned to user`,
        });
    } catch (error) {
        console.error("Admin VM create error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create VM" },
            { status: 500 }
        );
    }
}
