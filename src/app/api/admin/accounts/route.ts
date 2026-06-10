import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/admin-guard";
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

/**
 * DELETE /api/admin/accounts — Bulk delete user accounts (admin only)
 * Body: { userIds: string[] }
 *
 * Safety:
 *   - Cannot delete yourself
 *   - Cannot delete other ADMIN accounts
 *   - Each deletion is individually audit-logged
 */
export async function DELETE(req: NextRequest) {
    try {
        const { userId: adminId, error } = await requireAdmin();
        if (error) return error;

        const { userIds } = (await req.json()) as { userIds: string[] };

        if (!Array.isArray(userIds) || userIds.length === 0) {
            return NextResponse.json(
                { error: "userIds array is required" },
                { status: 400 },
            );
        }

        // Cap bulk operations at 50 to prevent abuse
        if (userIds.length > 50) {
            return NextResponse.json(
                { error: "Maximum 50 accounts can be deleted at once" },
                { status: 400 },
            );
        }

        // Prevent self-deletion
        if (userIds.includes(adminId!)) {
            return NextResponse.json(
                { error: "Cannot delete your own account" },
                { status: 400 },
            );
        }

        // Fetch targets to validate and prevent admin deletion
        const targets = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, role: true, name: true },
        });

        const adminTargets = targets.filter(u => u.role === "ADMIN");
        if (adminTargets.length > 0) {
            return NextResponse.json(
                {
                    error: `Cannot delete admin accounts: ${adminTargets.map(a => a.email).join(", ")}`,
                },
                { status: 403 },
            );
        }

        const targetIds = targets.map(u => u.id);
        const notFound = userIds.filter(id => !targetIds.includes(id));

        // Delete all valid targets
        const result = await prisma.user.deleteMany({
            where: { id: { in: targetIds } },
        });

        // Audit-log each deletion individually
        for (const target of targets) {
            void audit({
                userId: adminId!,
                action: "ADMIN_USER_DELETE",
                resourceType: "UserAccount",
                resourceId: target.id,
                metadata: { targetEmail: target.email, targetName: target.name },
                req,
            });
        }

        return NextResponse.json({
            success: true,
            deleted: result.count,
            notFound: notFound.length > 0 ? notFound : undefined,
        });
    } catch (error) {
        console.error("Admin accounts DELETE error:", error);
        return NextResponse.json(
            { error: "Failed to delete accounts" },
            { status: 500 },
        );
    }
}
