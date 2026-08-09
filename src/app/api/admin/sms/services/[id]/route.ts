import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

/**
 * PATCH  /api/admin/sms/services/[id] — update a service (partial).
 * DELETE /api/admin/sms/services/[id] — delete; blocked if rentals exist
 *   (disable via PATCH active:false instead).
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const data: Record<string, unknown> = {};
    if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body?.country === "string" && body.country.trim()) data.country = body.country.trim().toUpperCase();
    if (typeof body?.code === "string" && body.code.trim()) data.code = body.code.trim().toLowerCase();
    if (body?.priceCredits !== undefined) {
        const p = Number(body.priceCredits);
        if (!Number.isInteger(p) || p < 0) {
            return NextResponse.json({ error: "priceCredits must be a non-negative integer" }, { status: 400 });
        }
        data.priceCredits = p;
    }
    if (body?.providerServiceCode !== undefined) {
        data.providerServiceCode = typeof body.providerServiceCode === "string" ? body.providerServiceCode.trim() || null : null;
    }
    if (body?.iconUrl !== undefined) {
        data.iconUrl = typeof body.iconUrl === "string" ? body.iconUrl.trim() || null : null;
    }
    if (typeof body?.active === "boolean") data.active = body.active;
    if (Number.isInteger(body?.sortOrder)) data.sortOrder = body.sortOrder;

    if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    try {
        const service = await prisma.smsService.update({ where: { id }, data });
        void audit({
            userId,
            action: "SMS_SERVICE_MODIFY",
            resourceType: "SmsService",
            resourceId: id,
            metadata: { op: "update", fields: Object.keys(data) },
            req,
        });
        return NextResponse.json({ service });
    } catch (err: unknown) {
        if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
            return NextResponse.json({ error: "Another service already uses this code for that country." }, { status: 409 });
        }
        console.error("[admin/sms/services/:id] PATCH error:", err);
        return NextResponse.json({ error: "Failed to update service" }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const rentalCount = await prisma.smsRental.count({ where: { serviceId: id } });
    if (rentalCount > 0) {
        return NextResponse.json(
            { error: "Service has rental history — disable it (active: false) instead of deleting." },
            { status: 409 },
        );
    }

    await prisma.smsService.delete({ where: { id } });
    void audit({
        userId,
        action: "SMS_SERVICE_MODIFY",
        resourceType: "SmsService",
        resourceId: id,
        metadata: { op: "delete" },
        req,
    });
    return NextResponse.json({ success: true });
}
