import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import {
    createMailbox,
    generateMailboxPassword,
    isValidLocalPart,
} from "@/lib/mail-accounts";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/mail/mailboxes — every mailbox, with its owner.
 * Query: q (search address or owner email), domain, limit, offset.
 */
export async function GET(req: Request) {
    const { error } = await requireAdmin();
    if (error) return error;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const domainFilter = url.searchParams.get("domain");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

    // MySQL collations here are case-insensitive already, so `contains` needs
    // no mode:"insensitive" — which this provider does not support anyway.
    const where = {
        ...(q ? {
            OR: [
                { address: { contains: q } },
                { user: { email: { contains: q } } },
            ],
        } : {}),
        ...(domainFilter ? { domain: { domain: domainFilter } } : {}),
    };

    const [mailboxes, total, domains] = await Promise.all([
        prisma.mailMailbox.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: limit,
            skip: offset,
            select: {
                id: true, address: true, localPart: true, quotaMb: true,
                active: true, kind: true, createdAt: true, lastLoginAt: true,
                domain: { select: { id: true, domain: true } },
                user: { select: { id: true, email: true, name: true } },
            },
        }),
        prisma.mailMailbox.count({ where }),
        prisma.mailDomain.findMany({
            select: {
                id: true, domain: true, active: true, adminOnly: true, catchAll: true,
                _count: { select: { mailboxes: true } },
            },
            orderBy: { domain: "asc" },
        }),
    ]);

    return NextResponse.json({ mailboxes, total, domains });
}

const createSchema = z.object({
    localPart: z.string().trim().min(1).max(64),
    domain: z.string().trim().min(1).max(255),
    /** Optional owner. Omit for a functional box (support@, noreply@). */
    userId: z.string().min(1).max(64).nullable().optional(),
    quotaMb: z.number().int().min(64).max(102400).optional(),
    kind: z.enum(["USER", "SYSTEM", "CATCHALL"]).optional(),
});

/**
 * POST /api/admin/mail/mailboxes — create a mailbox on any domain, for any
 * user or none. This is the admin's "full control" path: it bypasses the
 * self-service rules (reserved names, user-domain restriction) on purpose.
 */
export async function POST(req: Request) {
    const { userId: adminId, error } = await requireAdmin();
    if (error) return error;

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { localPart, domain, userId = null, quotaMb, kind } = parsed.data;

    const lp = localPart.toLowerCase();
    if (!isValidLocalPart(lp)) {
        return NextResponse.json({
            error: "Address must be 3-40 characters: letters, numbers, dot, dash or underscore.",
        }, { status: 400 });
    }

    if (userId) {
        const owner = await prisma.user.findUnique({
            where: { id: userId }, select: { id: true },
        });
        if (!owner) return NextResponse.json({ error: "No such user" }, { status: 404 });
    }

    const password = generateMailboxPassword();
    const result = await createMailbox({
        userId, domain, localPart: lp, password, quotaMb, kind: kind ?? (userId ? "USER" : "SYSTEM"),
    });
    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    void audit({
        userId: adminId!,
        action: "MAILBOX_CREATE",
        resourceType: "MailMailbox",
        resourceId: result.mailbox.id,
        metadata: { address: result.mailbox.address, forUserId: userId, byAdmin: true },
        req,
    });

    return NextResponse.json({ mailbox: result.mailbox, password }, { status: 201 });
}
