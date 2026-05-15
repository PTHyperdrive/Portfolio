import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/cms/manual/sections
 * Create a new section within a chapter. Admin only.
 * Body: { chapterId, parentId?, title, slug?, content, sortOrder?, published? }
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if ((session.user as Record<string, unknown>)?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { chapterId, parentId, title, slug, content, sortOrder, published } = body as {
            chapterId: string;
            parentId?: string;
            title: string;
            slug?: string;
            content?: string;
            sortOrder?: number;
            published?: boolean;
        };

        if (!chapterId?.trim()) {
            return NextResponse.json({ error: "chapterId is required" }, { status: 400 });
        }
        if (!title?.trim()) {
            return NextResponse.json({ error: "Title is required" }, { status: 400 });
        }

        // Verify chapter exists
        const chapter = await prisma.manualChapter.findUnique({ where: { id: chapterId } });
        if (!chapter) {
            return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
        }

        // Verify parent exists if provided
        if (parentId) {
            const parent = await prisma.manualSection.findUnique({ where: { id: parentId } });
            if (!parent || parent.chapterId !== chapterId) {
                return NextResponse.json({ error: "Parent section not found in this chapter" }, { status: 404 });
            }
        }

        const finalSlug = (slug?.trim() || title.trim())
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .substring(0, 80);

        // Check slug uniqueness within chapter
        const existing = await prisma.manualSection.findUnique({
            where: { chapterId_slug: { chapterId, slug: finalSlug } },
        });
        if (existing) {
            return NextResponse.json({ error: "A section with this slug already exists in this chapter" }, { status: 409 });
        }

        const section = await prisma.manualSection.create({
            data: {
                chapterId,
                parentId: parentId || null,
                title: title.trim(),
                slug: finalSlug,
                content: content?.trim() || "",
                sortOrder: sortOrder ?? 0,
                published: published ?? false,
            },
        });

        return NextResponse.json({ section }, { status: 201 });
    } catch (error) {
        console.error("[manual/sections] POST error:", error);
        return NextResponse.json({ error: "Failed to create section" }, { status: 500 });
    }
}
