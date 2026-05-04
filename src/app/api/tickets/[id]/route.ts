import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET  /api/tickets/[id] — Get single ticket (owner or admin only)
 * PATCH /api/tickets/[id] — Update ticket status (admin only)
 *   When status → SOLVED, creates a TicketNotification for the user.
 */

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true },
        });

        const ticket = await prisma.ticket.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
        });

        if (!ticket) {
            return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
        }

        // Access control: owner or admin
        if (ticket.userId !== session.user.id && user?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        return NextResponse.json(ticket);
    } catch (err) {
        console.error("[GET /api/tickets/[id]]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true },
        });

        if (user?.role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const { id } = await params;
        const body = await req.json();
        const { status } = body;

        if (!["PENDING", "UNSOLVED", "SOLVED"].includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        const ticket = await prisma.ticket.findUnique({ where: { id } });
        if (!ticket) {
            return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
        }

        const updateData: Record<string, unknown> = {
            status,
        };
        if (status === "SOLVED") {
            updateData.resolvedAt = new Date();
        }

        const updated = await prisma.ticket.update({
            where: { id },
            data: updateData,
        });

        // Trigger notification when resolved
        if (status === "SOLVED" && ticket.userId) {
            await prisma.ticketNotification.create({
                data: {
                    ticketId: id,
                    userId: ticket.userId,
                    message: `Your ticket "${ticket.title}" has been resolved.`,
                },
            });
        }

        return NextResponse.json(updated);
    } catch (err) {
        console.error("[PATCH /api/tickets/[id]]", err);
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }
}
