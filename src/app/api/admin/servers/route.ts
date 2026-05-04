import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/servers — All VPS instances across all users.
 * Query params: page, limit, search, status, sort
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        if (user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const page   = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
        const limit  = Math.min(50, parseInt(searchParams.get("limit") ?? "20"));
        const search = searchParams.get("search") ?? "";
        const status = searchParams.get("status") ?? "";
        const sort   = searchParams.get("sort")   ?? "createdAt_desc";

        const [sortField, sortDir] = sort.split("_") as [string, "asc" | "desc"];

        const where = {
            ...(status ? { status } : {}),
            ...(search ? {
                OR: [
                    { name: { contains: search } },
                    { vmId: { contains: search } },
                    { ipAddress: { contains: search } },
                    { node: { contains: search } },
                    { user: { OR: [{ email: { contains: search } }, { name: { contains: search } }] } },
                ],
            } : {}),
        };

        const orderBy = sortField === "name"
            ? { name: sortDir }
            : sortField === "status"
                ? { status: sortDir }
                : { createdAt: sortDir };

        const [instances, total] = await Promise.all([
            prisma.vpsInstance.findMany({
                where,
                orderBy,
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    user: { select: { id: true, name: true, email: true } },
                },
            }),
            prisma.vpsInstance.count({ where }),
        ]);

        return NextResponse.json({
            instances,
            meta: {
                page, limit, total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPrevPage: page > 1,
            },
        });
    } catch (err) {
        console.error("[GET /api/admin/servers]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
