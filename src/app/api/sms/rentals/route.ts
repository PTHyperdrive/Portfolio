import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/security";
import { require2fa, twoFactorErrorResponse } from "@/lib/require2fa";
import { getSmsProvider } from "@/lib/sms-provider";

/** Rental TTL — a number auto-expires (no charge) if no code arrives in time. */
export const RENTAL_TTL_MS = 15 * 60_000;
/** Max concurrent WAITING rentals per user (counters free number-holding). */
const MAX_ACTIVE = 5;

// Shape returned to the client — `code` is null until the rental is charged.
function serialize(r: {
    id: string; phoneNumber: string | null; country: string; status: string;
    priceCredits: number; code: string | null; charged: boolean;
    createdAt: Date; expiresAt: Date; service?: { name: string; code: string } | null;
}) {
    return {
        id: r.id,
        phoneNumber: r.phoneNumber,
        country: r.country,
        status: r.status,
        priceCredits: r.priceCredits,
        code: r.charged ? r.code : null,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        service: r.service ?? null,
    };
}

/** GET /api/sms/rentals — the caller's active + recent rentals. */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rentals = await prisma.smsRental.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { service: { select: { name: true, code: true } } },
    });

    return NextResponse.json({ rentals: rentals.map(serialize) });
}

/**
 * POST /api/sms/rentals — rent a number for a service.
 * Body: { serviceId: string, totpToken?: string }
 * Billing is charge-on-receipt: nothing is deducted here, but the caller must
 * already hold >= the service price (so a delivered code can always be charged).
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;

        if (!checkRateLimit(`sms-rent:${userId}`, 10, 60_000).allowed) {
            return NextResponse.json({ error: "Too many rentals. Slow down." }, { status: 429 });
        }

        const body = await req.json().catch(() => ({}));
        const serviceId = typeof body?.serviceId === "string" ? body.serviceId : "";
        if (!serviceId) {
            return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
        }

        const service = await prisma.smsService.findFirst({ where: { id: serviceId, active: true } });
        if (!service) {
            return NextResponse.json({ error: "Service not found or inactive" }, { status: 404 });
        }

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
        // Charge-on-receipt still requires the balance up front so a delivered
        // code is always payable — otherwise the number could be held for free.
        if (user.credits < service.priceCredits) {
            return NextResponse.json(
                { error: "Insufficient credits", required: service.priceCredits, available: user.credits },
                { status: 402 },
            );
        }

        const active = await prisma.smsRental.count({ where: { userId, status: "WAITING" } });
        if (active >= MAX_ACTIVE) {
            return NextResponse.json(
                { error: `You can hold at most ${MAX_ACTIVE} active numbers at once.` },
                { status: 409 },
            );
        }

        // Step-up: renting a number is a billable, abuse-sensitive action.
        const twoFa = await require2fa(userId, typeof body?.totpToken === "string" ? body.totpToken : undefined);
        if (!twoFa.ok) return twoFactorErrorResponse(twoFa.error!);

        // Allocate a number from the provider.
        let allocated;
        try {
            allocated = await getSmsProvider().rentNumber({
                serviceCode: service.providerServiceCode || service.code,
                country: service.country,
            });
        } catch (err) {
            console.error("[sms/rentals] provider rentNumber failed:", err);
            return NextResponse.json({ error: "No numbers available right now. Try again shortly." }, { status: 503 });
        }

        const rental = await prisma.smsRental.create({
            data: {
                userId,
                serviceId: service.id,
                providerRentalId: allocated.providerRentalId,
                phoneNumber: allocated.phoneNumber,
                country: service.country,
                status: "WAITING",
                priceCredits: service.priceCredits,
                expiresAt: new Date(Date.now() + RENTAL_TTL_MS),
            },
            include: { service: { select: { name: true, code: true } } },
        });

        void audit({
            userId,
            action: "SMS_RENT",
            resourceType: "SmsRental",
            resourceId: rental.id,
            metadata: { service: service.code, country: service.country, priceCredits: service.priceCredits },
            req,
        });

        return NextResponse.json({ rental: serialize(rental) }, { status: 201 });
    } catch (err) {
        console.error("[sms/rentals] POST error:", err);
        return NextResponse.json({ error: "Failed to rent a number" }, { status: 500 });
    }
}
