import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPlan, getOsOption } from "@/lib/vps-plans";
import { cloneVM, getNextVMID, startVM } from "@/lib/proxmox";

/**
 * POST /api/vps/purchase
 *
 * Body: { planId: string, osId: string, vmName: string }
 *
 * - Negotiate/Enterprise plans: creates Order record only (no VM) → admin provisions manually
 * - All other plans: clones the OS template VM, creates VpsInstance in DB
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { planId, osId, vmName } = body as {
            planId: string;
            osId: string;
            vmName: string;
        };

        if (!planId || !osId || !vmName?.trim()) {
            return NextResponse.json({ error: "planId, osId, and vmName are required" }, { status: 400 });
        }

        const plan = getPlan(planId);
        if (!plan) {
            return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
        }

        const osOption = getOsOption(osId);
        if (!osOption && !plan.negotiate) {
            return NextResponse.json({ error: "Invalid OS selection" }, { status: 400 });
        }

        // ── Find or create a placeholder Service record for VPS ──────────────
        let service = await prisma.service.findFirst({
            where: { type: "VPS", name: plan.name },
        });

        if (!service) {
            service = await prisma.service.create({
                data: {
                    name: plan.name,
                    type: "VPS",
                    description: plan.tagline,
                    price: plan.price,
                    specs: plan.specs as object,
                    active: true,
                },
            });
        }

        // ── Create Order ─────────────────────────────────────────────────────
        const order = await prisma.order.create({
            data: {
                userId: session.user.id,
                serviceId: service.id,
                status: plan.negotiate ? "PENDING" : "PROCESSING",
                totalPrice: plan.price,
                config: { planId, osId, vmName },
                notes: plan.negotiate ? "Custom plan requested — awaiting admin provisioning" : undefined,
            },
        });

        // ── Negotiate plan: stop here, admin provisions VM manually ──────────
        if (plan.negotiate) {
            return NextResponse.json({
                success: true,
                negotiate: true,
                orderId: order.id,
                message: "Your request has been received. Our team will provision your custom VM and contact you.",
            });
        }

        // ── Standard plans: clone OS template ─────────────────────────────────
        const node = osOption!.node;
        const templateId = osOption!.templateVmId;

        // Get next VMID, enforcing minimum of 150
        let newVmId = parseInt(await getNextVMID());
        if (newVmId < 150) newVmId = 150;

        // Clone the template VM
        await cloneVM(
            node,
            templateId,
            newVmId,
            vmName.trim(),
            plan.storage,
            true, // full clone
        );

        // Wait a moment for PVE to register the clone
        await new Promise((r) => setTimeout(r, 2000));

        // Create VpsInstance in DB
        const instance = await prisma.vpsInstance.upsert({
            where: { vmId_node: { vmId: newVmId.toString(), node } },
            update: {
                name: vmName.trim(),
                os: osOption!.label,
                status: "stopped",
                specs: {
                    vcpu: plan.specs.vcpu,
                    ram_gb: plan.specs.ram_gb,
                    disk_gb: plan.specs.disk_gb,
                },
            },
            create: {
                userId: session.user.id,
                orderId: order.id,
                vmId: newVmId.toString(),
                node,
                name: vmName.trim(),
                os: osOption!.label,
                status: "stopped",
                specs: {
                    vcpu: plan.specs.vcpu,
                    ram_gb: plan.specs.ram_gb,
                    disk_gb: plan.specs.disk_gb,
                },
            },
        });

        // Update order to ACTIVE
        await prisma.order.update({
            where: { id: order.id },
            data: { status: "ACTIVE" },
        });

        // Optionally auto-start the VM
        try {
            await startVM(node, newVmId.toString());
            await prisma.vpsInstance.update({
                where: { id: instance.id },
                data: { status: "running" },
            });
        } catch {
            // Start failure is non-fatal — VM was created, user can start manually
        }

        return NextResponse.json({
            success: true,
            negotiate: false,
            orderId: order.id,
            instanceId: instance.id,
            vmId: newVmId.toString(),
            message: `VM "${vmName}" has been provisioned successfully!`,
        });

    } catch (error) {
        console.error("[vps/purchase] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Purchase failed" },
            { status: 500 }
        );
    }
}
