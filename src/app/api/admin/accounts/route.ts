import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/accounts — List all users with their VPS instances (admin only)
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check admin role
        if ((session.user as { role?: string }).role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                balance: true,
                createdAt: true,
                _count: {
                    select: {
                        orders: true,
                        vpsInstances: true,
                    },
                },
                vpsInstances: {
                    select: {
                        id: true,
                        vmId: true,
                        node: true,
                        name: true,
                        os: true,
                        status: true,
                        specs: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ users });
    } catch (error) {
        console.error("Admin accounts error:", error);
        return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
    }
}
