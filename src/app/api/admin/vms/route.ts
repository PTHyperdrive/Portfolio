import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

/**
 * GET /api/admin/vms
 *
 * Paginated + searchable list of all VPS instances across all users.
 * Admin only.
 *
 * Query params:
 *   ?page=1      (1-indexed, default 1)
 *   ?limit=10    (rows per page, max 100)
 *   ?search=foo  (filters name, ipAddress, or owner's email)
 */
export async function GET(req: Request) {
    try {
        const { error } = await requireAdmin();
        if (error) return error;

        const { searchParams } = new URL(req.url);
        const page   = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10));
        const limit  = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10)), 100);
        const search = searchParams.get("search")?.trim() ?? "";
        const skip   = (page - 1) * limit;

        // MySQL uses default LIKE; filter by vm name, IP address, or owner email
        const where = search
            ? {
                OR: [
                    { name:      { contains: search } },
                    { ipAddress: { contains: search } },
                    { user: { email: { contains: search } } },
                ],
            }
            : {};

        const [vms, total] = await prisma.$transaction([
            prisma.vpsInstance.findMany({
                where,
                include: {
                    user: {
                        select: { id: true, email: true, name: true },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: limit,
                skip,
            }),
            prisma.vpsInstance.count({ where }),
        ]);

        return NextResponse.json({
            data: vms,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Admin VMs list error:", error);
        return NextResponse.json({ error: "Failed to load VMs" }, { status: 500 });
    }
}
