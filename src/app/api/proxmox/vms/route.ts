import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVMStatus } from "@/lib/proxmox";
import { Prisma } from "@/generated/prisma";

/**
 * GET /api/proxmox/vms
 *
 * Server-side paginated + filtered VM list.
 *
 * Query params:
 *   page      (number, default 1)
 *   limit     (number, default 10, max 100)
 *   search    (string — matches name, OS, IP, vmId)
 *   status    (string — "running" | "stopped" | "paused" | "" for all)
 *   sort      (string — "createdAt_desc" | "createdAt_asc" | "name_asc" | "name_desc")
 *
 * Response:
 *   { instances, meta: { page, limit, total, totalPages } }
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const { searchParams } = new URL(req.url);

        // ── Parse & sanitize query params ────────────────────────────
        const page   = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10) || 1);
        const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));
        const search = (searchParams.get("search") ?? "").trim();
        const status = (searchParams.get("status") ?? "").trim().toLowerCase();
        const sort   = (searchParams.get("sort")   ?? "createdAt_desc").trim();
        const skip   = (page - 1) * limit;

        // ── Build WHERE clause (IQueryable equivalent) ────────────────
        const where: Prisma.VpsInstanceWhereInput = {
            userId,
            // Status filter — only apply if provided
            ...(status ? { status } : {}),
            // Search — OR across name / os / ipAddress / vmId
            ...(search ? {
                OR: [
                    { name:      { contains: search } },
                    { os:        { contains: search } },
                    { ipAddress: { contains: search } },
                    { vmId:      { contains: search } },
                ],
            } : {}),
        };

        // ── Build ORDER BY ────────────────────────────────────────────
        const SORT_MAP: Record<string, Prisma.VpsInstanceOrderByWithRelationInput> = {
            createdAt_desc: { createdAt: "desc" },
            createdAt_asc:  { createdAt: "asc"  },
            name_asc:       { name: "asc"        },
            name_desc:      { name: "desc"       },
        };
        const orderBy = SORT_MAP[sort] ?? { createdAt: "desc" };

        // ── Execute TWO queries: count + paginated data ───────────────
        // Both run against the same WHERE — Prisma keeps this as IQueryable until here
        const [total, instances] = await prisma.$transaction([
            prisma.vpsInstance.count({ where }),
            prisma.vpsInstance.findMany({ where, orderBy, skip, take: limit }),
        ]);

        const totalPages = Math.max(1, Math.ceil(total / limit));

        // ── Enrich with live Proxmox data (only for current page) ─────
        // Crucial: we only call Proxmox for the N rows on THIS page, not all rows
        const enriched = await Promise.all(
            instances.map(async (inst) => {
                let liveData = null;
                try {
                    liveData = await getVMStatus(inst.node, inst.vmId);
                } catch {
                    // Proxmox unreachable — fall back to DB status
                }
                return {
                    ...inst,
                    specs: inst.specs as Record<string, unknown> | null,
                    liveData,
                };
            })
        );

        return NextResponse.json({
            instances: enriched,
            meta: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        });
    } catch (error) {
        console.error("VMs list error:", error);
        return NextResponse.json({ error: "Failed to load VMs" }, { status: 500 });
    }
}
