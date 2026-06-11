import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, email } = body as {
            name?: string;
            email?: string;
        };

        if (name === undefined && email === undefined) {
            return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        }

        // Check email uniqueness
        if (email) {
            const existing = await prisma.user.findFirst({
                where: { email, NOT: { id: session.user.id } },
            });
            if (existing) {
                return NextResponse.json({ error: "Email already in use by another account" }, { status: 409 });
            }
        }

        const updated = await prisma.user.update({
            where: { id: session.user.id },
            data: {
                ...(name !== undefined && { name }),
                ...(email !== undefined && { email }),
            },
            select: { id: true, name: true, email: true },
        });

        return NextResponse.json({ user: updated });
    } catch (error) {
        console.error("Profile update error:", error);
        return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
}
