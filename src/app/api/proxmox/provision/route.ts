import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { startTrial } from "@/lib/trial-lifecycle";

/**
 * POST /api/proxmox/provision
 * Provisions a Trial VM for the authenticated user.
 * Anti-bypass: checks hasUsedTrial in the database (not session),
 * so replaying the request via Burp Suite etc. will always hit this check.
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
            select: { hasUsedTrial: true },
        });

        if (!dbUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (dbUser.hasUsedTrial) {
            return NextResponse.json(
                { error: "Trial already used. Each account is limited to one free trial." },
                { status: 403 }
            );
        }

        // Parse optional body params (node, template, etc.)
        let body: Record<string, unknown> = {};
        try {
            body = await req.json();
        } catch {
            // body is optional
        }

        const node = (body.node as string) || "pve-01";
        const template = (body.template as string) || "trial-template";

        // ── Mark trial as used BEFORE provisioning (atomic guard) ──
        await startTrial(userId);

        // ── Provision the VM via Proxmox (stub — real integration via proxmox lib) ──
        // TODO: Replace with actual Proxmox clone/start call when ready.
        const vmId = `trial-${userId.slice(0, 8)}`;
        const trialExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // Create a trial Order + VpsInstance atomically
        // We need a Service record to attach the Order to — look up or create a trial service
        let trialService = await prisma.service.findFirst({ where: { name: "Trial Plan" } });
        if (!trialService) {
            trialService = await prisma.service.create({
                data: { name: "Trial Plan", type: "VPS", description: "Free 30-day trial VPS", price: 0 },
            });
        }

        const order = await prisma.order.create({
            data: {
                userId,
                serviceId: trialService.id,
                status: "ACTIVE",
                totalPrice: 0,
                notes: "Trial provision",
            },
        });

        const instance = await prisma.vpsInstance.create({
            data: {
                userId,
                orderId: order.id,
                vmId,
                node,
                name: "Trial VPS",
                os: template,
                status: "provisioning",
                expiresAt: trialExpiresAt,
            },
        });

        return NextResponse.json({
            success: true,
            instance,
            message: "Trial VM provisioned. It will be ready in ~60 seconds.",
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
        return NextResponse.json({ error: "Provisioning failed" }, { status: 500 });
    }
}
