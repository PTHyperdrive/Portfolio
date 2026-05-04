import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/tickets — List tickets for the current user.
 *   Admin sees all tickets; regular users see only their own.
 * POST /api/tickets — Create a new ticket.
 */

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true },
        });
        const isAdmin = user?.role === "ADMIN";

        const tickets = await prisma.ticket.findMany({
            where: isAdmin ? {} : { userId: session.user.id },
            orderBy: { createdAt: "desc" },
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json({ tickets });
    } catch (err) {
        console.error("[GET /api/tickets]", err);
        return NextResponse.json({ error: "Failed to load tickets" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { title, description, priority, imageUrls } = body;

        if (!title?.trim()) {
            return NextResponse.json({ error: "Title is required" }, { status: 400 });
        }

        const ticket = await prisma.ticket.create({
            data: {
                userId: session.user.id,
                title: title.trim().slice(0, 200),
                description: description?.trim() || "",
                priority: ["low", "medium", "high", "critical"].includes(priority) ? priority : "medium",
                imageUrls: imageUrls ? JSON.stringify(imageUrls) : null,
            },
        });

        return NextResponse.json(ticket, { status: 201 });
    } catch (err) {
        console.error("[POST /api/tickets]", err);
        return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
    }
}
