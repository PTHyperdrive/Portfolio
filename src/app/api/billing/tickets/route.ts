import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/billing/tickets
 * Returns all AVAILABLE DeploymentTickets for the current user that haven't expired.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tickets = await prisma.deploymentTicket.findMany({
            where: {
                userId:     session.user.id,
                status:     "AVAILABLE",
                validUntil: { gt: new Date() },
            },
            select: {
                id:         true,
                planId:     true,
                status:     true,
                validUntil: true,
                createdAt:  true,
            },
            orderBy: { validUntil: "asc" },
        });

        return NextResponse.json({ tickets });
    } catch (err) {
        console.error("[tickets] GET error:", err);
        return NextResponse.json({ error: "Failed to load tickets" }, { status: 500 });
    }
}
