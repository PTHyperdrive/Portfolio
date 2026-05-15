import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface Params { params: Promise<{ id: string }> }

/**
 * GET /api/cms/manual/sections/[id]
 * Fetch a single section by ID with its children.
 */
export async function GET(_req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        const isAdmin = (session?.user as Record<string, unknown>)?.role === "ADMIN";

        const section = await prisma.manualSection.findUnique({
            where: { id },
            include: {
                chapter: { select: { id: true, title: true, slug: true } },
                children: {
                    where: isAdmin ? {} : { published: true },
                    orderBy: { sortOrder: "asc" },
                    select: { id: true, title: true, slug: true, sortOrder: true, published: true },
                },
            },
        });

        if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
        if (!isAdmin && !section.published) {
            return NextResponse.json({ error: "Section not found" }, { status: 404 });
        }

        return NextResponse.json({ section });
    } catch (error) {
        console.error("[manual/sections/[id]] GET error:", error);
        return NextResponse.json({ error: "Failed to load section" }, { status: 500 });
    }
}

/**
 * PATCH /api/cms/manual/sections/[id]
 * Update a section. Admin only.
 */
export async function PATCH(req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if ((session.user as Record<string, unknown>)?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existing = await prisma.manualSection.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ error: "Section not found" }, { status: 404 });

        const body = await req.json();
        const { title, slug, content, parentId, sortOrder, published } = body as {
            title?: string;
            slug?: string;
            content?: string;
            parentId?: string | null;
            sortOrder?: number;
            published?: boolean;
        };

        // Validate slug uniqueness within chapter if changed
        if (slug && slug !== existing.slug) {
            const dup = await prisma.manualSection.findUnique({
                where: { chapterId_slug: { chapterId: existing.chapterId, slug } },
            });
            if (dup) return NextResponse.json({ error: "Slug already in use in this chapter" }, { status: 409 });
        }

        // Prevent circular parent reference
        if (parentId === id) {
            return NextResponse.json({ error: "A section cannot be its own parent" }, { status: 400 });
        }

        const section = await prisma.manualSection.update({
            where: { id },
            data: {
                ...(title !== undefined && { title: title.trim() }),
                ...(slug !== undefined && { slug: slug.trim() }),
                ...(content !== undefined && { content: content.trim() }),
                ...(parentId !== undefined && { parentId: parentId || null }),
                ...(sortOrder !== undefined && { sortOrder }),
                ...(published !== undefined && { published }),
            },
        });

        return NextResponse.json({ section });
    } catch (error) {
        console.error("[manual/sections/[id]] PATCH error:", error);
        return NextResponse.json({ error: "Failed to update section" }, { status: 500 });
    }
}

/**
 * DELETE /api/cms/manual/sections/[id]
 * Delete a section and cascade children. Admin only.
 */
export async function DELETE(_req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if ((session.user as Record<string, unknown>)?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existing = await prisma.manualSection.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ error: "Section not found" }, { status: 404 });

        // Delete children first (manual cascade for self-referencing)
        await prisma.manualSection.deleteMany({ where: { parentId: id } });
        await prisma.manualSection.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[manual/sections/[id]] DELETE error:", error);
        return NextResponse.json({ error: "Failed to delete section" }, { status: 500 });
    }
}
