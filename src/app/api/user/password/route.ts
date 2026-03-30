import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/security";
import { audit } from "@/lib/audit";

export async function PATCH(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { oldPassword, newPassword } = await req.json() as { oldPassword: string; newPassword: string };

        if (!oldPassword || !newPassword) {
            return NextResponse.json({ error: "Both current and new password are required" }, { status: 400 });
        }

        if (newPassword.length < 8) {
            return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { passwordHash: true },
        });

        if (!user?.passwordHash) {
            return NextResponse.json({ error: "No password set on this account" }, { status: 400 });
        }

        const isValid = await verifyPassword(oldPassword, user.passwordHash);
        if (!isValid) {
            return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
        }

        const newHash = await hashPassword(newPassword);
        await prisma.user.update({
            where: { id: session.user.id },
            data: { passwordHash: newHash },
        });

        // ISO 27001: Audit password change
        void audit({
            userId: session.user.id,
            action: "PASSWORD_CHANGED",
            resourceType: "UserAccount",
            resourceId: session.user.id,
            req,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Password update error:", error);
        return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
    }
}
