import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 10;

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
        const skip = (page - 1) * PAGE_SIZE;

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: "desc" },
                skip,
                take: PAGE_SIZE,
                include: { user: { select: { email: true, name: true } } },
            }),
            prisma.auditLog.count({ where: { userId: session.user.id } }),
        ]);

        return NextResponse.json({ logs, total, page, pageSize: PAGE_SIZE });
    } catch (err) {
        console.error("[audit-log] GET error:", err);
        return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
    }
}
