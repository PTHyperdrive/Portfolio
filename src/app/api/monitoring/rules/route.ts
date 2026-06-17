import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * VM alert rules for the signed-in user.
 *
 * GET    /api/monitoring/rules?vmId=...  → list rules (optionally for one VM)
 * POST   /api/monitoring/rules           → create/update a rule (upsert per metric)
 * PATCH  /api/monitoring/rules           → toggle a rule { id, enabled }
 * DELETE /api/monitoring/rules?id=...     → delete a rule
 */

const METRICS = new Set(["cpu", "mem", "disk", "bandwidth"]);
const COMPARISONS = new Set(["gt", "lt"]);

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const vmId = new URL(req.url).searchParams.get("vmId") ?? undefined;
    const rules = await prisma.vmAlertRule.findMany({
        where: { userId: session.user.id, ...(vmId ? { vmId } : {}) },
        orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const body = await req.json().catch(() => ({}));
    const vmId = typeof body?.vmId === "string" ? body.vmId : "";
    const metric = typeof body?.metric === "string" ? body.metric : "";
    const comparison = typeof body?.comparison === "string" ? body.comparison : "gt";
    const threshold = Number(body?.threshold);

    if (!vmId || !METRICS.has(metric)) {
        return NextResponse.json({ error: "vmId and a valid metric (cpu|mem|disk|bandwidth) are required" }, { status: 400 });
    }
    if (!COMPARISONS.has(comparison)) {
        return NextResponse.json({ error: "comparison must be gt or lt" }, { status: 400 });
    }
    if (!Number.isFinite(threshold) || threshold <= 0) {
        return NextResponse.json({ error: "threshold must be a positive number" }, { status: 400 });
    }

    // Ownership — the VM must belong to the caller.
    const vm = await prisma.vpsInstance.findFirst({ where: { vmId, userId }, select: { node: true } });
    if (!vm) return NextResponse.json({ error: "VM not found" }, { status: 404 });

    const rule = await prisma.vmAlertRule.upsert({
        where: { userId_vmId_metric: { userId, vmId, metric } },
        update: { comparison, threshold, node: vm.node, enabled: body?.enabled !== false },
        create: { userId, vmId, node: vm.node, metric, comparison, threshold, enabled: body?.enabled !== false },
    });
    return NextResponse.json({ rule }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id || typeof body?.enabled !== "boolean") {
        return NextResponse.json({ error: "id and enabled are required" }, { status: 400 });
    }
    await prisma.vmAlertRule.updateMany({
        where: { id, userId: session.user.id },
        data: { enabled: body.enabled },
    });
    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await prisma.vmAlertRule.deleteMany({ where: { id, userId: session.user.id } });
    return NextResponse.json({ ok: true });
}
