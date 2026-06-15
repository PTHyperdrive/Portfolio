import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/sms/services — active TimoSMS catalog for the storefront.
 * Prices are in credits (1 credit = 1 VND); the UI shows a USD equivalent.
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const services = await prisma.smsService.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, code: true, name: true, country: true, priceCredits: true, iconUrl: true },
    });

    return NextResponse.json({ services });
}
