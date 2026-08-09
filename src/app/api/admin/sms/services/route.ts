import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

/**
 * GET  /api/admin/sms/services — all SMS services (active + inactive).
 * POST /api/admin/sms/services — create a service.
 *   Body: { code, name, country?, priceCredits, providerServiceCode?, iconUrl?, sortOrder?, active? }
 */
export async function GET() {
    const { error } = await requireAdmin();
    if (error) return error;

    const services = await prisma.smsService.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ services });
}

export async function POST(req: NextRequest) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim().toLowerCase() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const country = typeof body?.country === "string" && body.country.trim() ? body.country.trim().toUpperCase() : "VN";
    const priceCredits = Number(body?.priceCredits);

    if (!code || !name) {
        return NextResponse.json({ error: "code and name are required" }, { status: 400 });
    }
    if (!Number.isInteger(priceCredits) || priceCredits < 0) {
        return NextResponse.json({ error: "priceCredits must be a non-negative integer" }, { status: 400 });
    }

    try {
        const service = await prisma.smsService.create({
            data: {
                code,
                name,
                country,
                priceCredits,
                providerServiceCode: typeof body?.providerServiceCode === "string" ? body.providerServiceCode.trim() || null : null,
                iconUrl: typeof body?.iconUrl === "string" ? body.iconUrl.trim() || null : null,
                sortOrder: Number.isInteger(body?.sortOrder) ? body.sortOrder : 0,
                active: body?.active !== false,
            },
        });

        void audit({
            userId,
            action: "SMS_SERVICE_MODIFY",
            resourceType: "SmsService",
            resourceId: service.id,
            metadata: { op: "create", code, country, priceCredits },
            req,
        });

        return NextResponse.json({ service }, { status: 201 });
    } catch (err: unknown) {
        // Unique [code, country] collision
        if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
            return NextResponse.json({ error: "A service with this code already exists for that country." }, { status: 409 });
        }
        console.error("[admin/sms/services] POST error:", err);
        return NextResponse.json({ error: "Failed to create service" }, { status: 500 });
    }
}
