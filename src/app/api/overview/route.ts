import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                balance: true,
                activePlan: true,
                planActivatedAt: true,
            },
        });

        const vpsInstances = await prisma.vpsInstance.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
            take: 5,
        });

        // Normalize to the shape the UI expects
        return NextResponse.json({
            user: user ? {
                ...user,
                credits: Number(user.balance ?? 0),
                twoFactorEnabled: false, // Will be real once prisma db push runs
            } : null,
            vpsInstances,
        });
    } catch (err) {
        console.error("[overview] GET error:", err);
        return NextResponse.json({ error: "Failed to load overview" }, { status: 500 });
    }
}
