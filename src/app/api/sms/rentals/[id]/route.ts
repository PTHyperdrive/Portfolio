import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/security";
import { getSmsProvider, extractCode } from "@/lib/sms-provider";

class InsufficientAtReceipt extends Error {}

interface RentalRow {
    id: string; userId: string; providerRentalId: string | null;
    phoneNumber: string | null; country: string; status: string;
    priceCredits: number; code: string | null; charged: boolean;
    createdAt: Date; expiresAt: Date;
    service?: { name: string; code: string } | null;
}

function serialize(r: RentalRow, needsCredits = false) {
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
        needsCredits,
    };
}

/**
 * GET /api/sms/rentals/[id] — poll one rental.
 * The client polls this (~5s). While WAITING and not expired, we pull inbound
 * messages from the provider; the first one carrying an OTP triggers an atomic
 * charge (charge-on-receipt) and reveals the code. Past TTL → EXPIRED, no charge.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;
        const { id } = await params;

        // Light throttle so a tab left open doesn't hammer the provider.
        if (!checkRateLimit(`sms-poll:${userId}:${id}`, 20, 60_000).allowed) {
            return NextResponse.json({ error: "Polling too fast." }, { status: 429 });
        }

        const rental = await prisma.smsRental.findFirst({
            where: { id, userId },
            include: { service: { select: { name: true, code: true } } },
        });
        if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });

        if (rental.status !== "WAITING") {
            return NextResponse.json({ rental: serialize(rental) });
        }

        // Expired with no code → release, no charge.
        if (Date.now() > rental.expiresAt.getTime()) {
            if (rental.providerRentalId) {
                try { await getSmsProvider().cancel(rental.providerRentalId); } catch { /* best-effort */ }
            }
            const expired = await prisma.smsRental.update({
                where: { id: rental.id },
                data: { status: "EXPIRED" },
                include: { service: { select: { name: true, code: true } } },
            });
            return NextResponse.json({ rental: serialize(expired) });
        }

        // Poll the provider for inbound SMS.
        let messages: { sender?: string; text: string }[] = [];
        if (rental.providerRentalId) {
            try { messages = await getSmsProvider().pollMessages(rental.providerRentalId); }
            catch (err) { console.error("[sms poll] provider error:", err); }
        }

        const coded = messages.map(m => ({ ...m, code: extractCode(m.text) })).find(m => m.code);
        if (!coded?.code) {
            return NextResponse.json({ rental: serialize(rental) }); // still waiting
        }

        // Charge-on-receipt: claim the rental, deduct credits, store the message.
        // The conditional claim makes concurrent polls idempotent; an insufficient
        // balance at receipt rolls the whole thing back (code stays withheld).
        let needsCredits = false;
        try {
            await prisma.$transaction(async (tx) => {
                const claimed = await tx.smsRental.updateMany({
                    where: { id: rental.id, status: "WAITING", charged: false },
                    data: { status: "RECEIVED", charged: true, code: coded.code, completedAt: new Date() },
                });
                if (claimed.count === 0) return; // another poll already settled it

                const charge = await tx.user.updateMany({
                    where: { id: userId, credits: { gte: rental.priceCredits } },
                    data: { credits: { decrement: rental.priceCredits } },
                });
                if (charge.count === 0) throw new InsufficientAtReceipt();

                await tx.creditTransaction.create({
                    data: {
                        userId,
                        type: "SMS_Rental",
                        amount: -rental.priceCredits,
                        details: `SMS code — ${rental.service?.name ?? rental.serviceId} (${rental.phoneNumber ?? "?"})`,
                    },
                });
                await tx.smsMessage.create({
                    data: { rentalId: rental.id, sender: coded.sender ?? null, text: coded.text, code: coded.code },
                });
            });
        } catch (e) {
            if (e instanceof InsufficientAtReceipt) {
                needsCredits = true; // rolled back — still WAITING, code withheld
            } else {
                throw e;
            }
        }

        if (!needsCredits) {
            void audit({
                userId,
                action: "SMS_CODE_RECEIVED",
                resourceType: "SmsRental",
                resourceId: rental.id,
                metadata: { service: rental.service?.code, priceCredits: rental.priceCredits },
            });
        }

        const fresh = await prisma.smsRental.findFirst({
            where: { id: rental.id, userId },
            include: { service: { select: { name: true, code: true } } },
        });
        return NextResponse.json({ rental: serialize(fresh as RentalRow, needsCredits) });
    } catch (err) {
        console.error("[sms/rentals/:id] GET error:", err);
        return NextResponse.json({ error: "Failed to load rental" }, { status: 500 });
    }
}

/** DELETE /api/sms/rentals/[id] — cancel a WAITING rental (no charge). */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;
        const { id } = await params;

        const rental = await prisma.smsRental.findFirst({ where: { id, userId } });
        if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });
        if (rental.status !== "WAITING") {
            return NextResponse.json({ error: "Only an active rental can be cancelled." }, { status: 400 });
        }

        if (rental.providerRentalId) {
            try { await getSmsProvider().cancel(rental.providerRentalId); } catch { /* best-effort */ }
        }
        await prisma.smsRental.update({
            where: { id: rental.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
        });

        void audit({
            userId,
            action: "SMS_CANCEL",
            resourceType: "SmsRental",
            resourceId: rental.id,
            req,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[sms/rentals/:id] DELETE error:", err);
        return NextResponse.json({ error: "Failed to cancel rental" }, { status: 500 });
    }
}
