import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

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
                credits: true,
                hasUsedTrial: true,
                canInvite: true,
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

/**
 * PUT /api/admin/accounts — Toggle user permissions (canInvite, etc.)
 * Body: { userId: string, canInvite?: boolean }
 */
export async function PUT(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if ((session.user as { role?: string }).role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const { userId, canInvite } = await req.json();

        if (!userId || typeof canInvite !== "boolean") {
            return NextResponse.json({ error: "userId and canInvite (boolean) are required" }, { status: 400 });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { canInvite },
            select: { id: true, email: true, canInvite: true },
        });

        void audit({
            userId: session.user.id,
            action: "INVITE_PERMISSION_CHANGED",
            resourceType: "UserAccount",
            resourceId: userId,
            metadata: { targetEmail: user.email, canInvite },
            req,
        });

        return NextResponse.json({ success: true, user });
    } catch (error) {
        console.error("Admin accounts PUT error:", error);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}

