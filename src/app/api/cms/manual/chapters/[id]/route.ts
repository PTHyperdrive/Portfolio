import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface Params { params: Promise<{ id: string }> }

/**
 * GET /api/cms/manual/chapters/[id]
 * Fetch a single chapter with full section tree. Supports lookup by ID or slug.
 */
export async function GET(_req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        const isAdmin = (session?.user as Record<string, unknown>)?.role === "ADMIN";

        const chapter = await prisma.manualChapter.findFirst({
            where: {
                OR: [{ id }, { slug: id }],
                ...(!isAdmin ? { published: true } : {}),
            },
            include: {
                sections: {
                    where: isAdmin ? {} : { published: true },
                    orderBy: { sortOrder: "asc" },
                },
            },
        });

        if (!chapter) {
            return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
        }

        // Build tree
        const map = new Map<string, Record<string, unknown>>();
        const roots: Array<Record<string, unknown>> = [];
        for (const s of chapter.sections) {
            map.set(s.id, { ...s, children: [] });
        }
        for (const s of chapter.sections) {
            const node = map.get(s.id)!;
            if (s.parentId && map.has(s.parentId)) {
                (map.get(s.parentId)!.children as Array<Record<string, unknown>>).push(node);
            } else {
                roots.push(node);
            }
        }

        return NextResponse.json({ chapter: { ...chapter, sections: roots } });
    } catch (error) {
        console.error("[manual/chapters/[id]] GET error:", error);
        return NextResponse.json({ error: "Failed to load chapter" }, { status: 500 });
    }
}

/**
 * PATCH /api/cms/manual/chapters/[id]
 * Update a chapter. Admin only.
 */
export async function PATCH(req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if ((session.user as Record<string, unknown>)?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existing = await prisma.manualChapter.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

        const body = await req.json();
        const { title, slug, icon, sortOrder, published } = body as {
            title?: string;
            slug?: string;
            icon?: string;
            sortOrder?: number;
            published?: boolean;
        };

        if (slug && slug !== existing.slug) {
            const dup = await prisma.manualChapter.findUnique({ where: { slug } });
            if (dup) return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
        }

        const chapter = await prisma.manualChapter.update({
            where: { id },
            data: {
                ...(title !== undefined && { title: title.trim() }),
                ...(slug !== undefined && { slug: slug.trim() }),
                ...(icon !== undefined && { icon: icon?.trim() || null }),
                ...(sortOrder !== undefined && { sortOrder }),
                ...(published !== undefined && { published }),
            },
        });

        return NextResponse.json({ chapter });
    } catch (error) {
        console.error("[manual/chapters/[id]] PATCH error:", error);
        return NextResponse.json({ error: "Failed to update chapter" }, { status: 500 });
    }
}

/**
 * DELETE /api/cms/manual/chapters/[id]
 * Delete a chapter and cascade all sections. Admin only.
 */
export async function DELETE(_req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if ((session.user as Record<string, unknown>)?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existing = await prisma.manualChapter.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

        await prisma.manualChapter.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[manual/chapters/[id]] DELETE error:", error);
        return NextResponse.json({ error: "Failed to delete chapter" }, { status: 500 });
    }
}
