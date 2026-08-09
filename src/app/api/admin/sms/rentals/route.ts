import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

/** GET /api/admin/sms/rentals — recent rentals across all users (admin overview). */
export async function GET() {
    const { error } = await requireAdmin();
    if (error) return error;

    const rentals = await prisma.smsRental.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
            user: { select: { email: true, name: true } },
            service: { select: { name: true, code: true } },
        },
    });

    // Never expose delivered codes in the admin overview.
    return NextResponse.json({
        rentals: rentals.map(r => ({
            id: r.id,
            user: r.user?.email ?? r.userId,
            service: r.service?.name ?? r.serviceId,
            phoneNumber: r.phoneNumber,
            country: r.country,
            status: r.status,
            priceCredits: r.priceCredits,
            charged: r.charged,
            createdAt: r.createdAt,
        })),
    });
}
