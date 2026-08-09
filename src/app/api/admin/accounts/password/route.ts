import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/security";
import { audit } from "@/lib/audit";

/**
 * PATCH /api/admin/accounts/password
 *
 * Admin-only: Reset a user's password without knowing the current one.
 * Body: { userId: string, newPassword: string }
 */
export async function PATCH(req: NextRequest) {
    try {
        const { userId: adminId, error } = await requireAdmin();
        if (error) return error;

        const { userId, newPassword } = (await req.json()) as {
            userId: string;
            newPassword: string;
        };

        if (!userId || !newPassword) {
            return NextResponse.json(
                { error: "userId and newPassword are required" },
                { status: 400 },
            );
        }

        if (newPassword.length < 8) {
            return NextResponse.json(
                { error: "Password must be at least 8 characters" },
                { status: 400 },
            );
        }

        // Verify target user exists
        const target = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true },
        });

        if (!target) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 },
            );
        }

        const newHash = await hashPassword(newPassword);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: newHash },
        });

        // ISO 27001: Audit admin-initiated password reset
        void audit({
            userId: adminId!,
            action: "ADMIN_PASSWORD_RESET",
            resourceType: "UserAccount",
            resourceId: userId,
            metadata: { targetEmail: target.email },
            req,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Admin password reset error:", error);
        return NextResponse.json(
            { error: "Failed to reset password" },
            { status: 500 },
        );
    }
}
