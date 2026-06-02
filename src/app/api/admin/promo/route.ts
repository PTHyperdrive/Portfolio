import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * GET /api/admin/promo — List all promo codes
 */
export async function GET() {
    const { error } = await requireAdmin();
    if (error) return error;

    try {
        const codes = await prisma.promoCode.findMany({
            include: {
                appliedToUsers: {
                    select: { userId: true, appliedAt: true },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ codes });
    } catch (e) {
        console.error("[admin/promo] GET error:", e);
        return NextResponse.json({ error: "Failed to load promo codes" }, { status: 500 });
    }
}

/**
 * POST /api/admin/promo — Create a new promo code
 * Body: { code, creditValue, maxUses?, expiresAt? }
 */
export async function POST(req: NextRequest) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    try {
        const { code, creditValue, maxUses, expiresAt } = await req.json();

        if (!code || typeof code !== "string" || code.length < 3) {
            return NextResponse.json({ error: "Code must be at least 3 characters" }, { status: 400 });
        }
        if (typeof creditValue !== "number" || creditValue <= 0) {
            return NextResponse.json({ error: "creditValue must be a positive number" }, { status: 400 });
        }
        if (!Number.isInteger(creditValue) || creditValue > 2_147_483_647) {
            return NextResponse.json({ error: "creditValue must be a whole number up to 2,147,483,647" }, { status: 400 });
        }

        const safeMaxUses = maxUses ?? 1;
        if (!Number.isInteger(safeMaxUses) || safeMaxUses < 1 || safeMaxUses > 2_147_483_647) {
            return NextResponse.json({ error: "maxUses must be a whole number between 1 and 2,147,483,647" }, { status: 400 });
        }

        const existing = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
        if (existing) {
            return NextResponse.json({ error: "Code already exists" }, { status: 409 });
        }

        const promo = await prisma.promoCode.create({
            data: {
                code: code.toUpperCase(),
                creditValue,
                maxUses: safeMaxUses,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
            },
        });

        void audit({
            userId,
            action: "ADMIN_PRICING_CHANGE",
            resourceType: "PromoCode",
            resourceId: promo.id,
            metadata: { code: promo.code, creditValue, maxUses: promo.maxUses },
            req,
        });

        return NextResponse.json({ promo }, { status: 201 });
    } catch (e) {
        console.error("[admin/promo] POST error:", e);
        return NextResponse.json({ error: "Failed to create promo code" }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/promo — Delete a promo code
 * Body: { id: string }
 */
export async function DELETE(req: NextRequest) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

        const promo = await prisma.promoCode.delete({ where: { id } });

        void audit({
            userId,
            action: "ADMIN_PRICING_CHANGE",
            resourceType: "PromoCode",
            resourceId: id,
            metadata: { deleted: promo.code },
            req,
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[admin/promo] DELETE error:", e);
        return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }
}
