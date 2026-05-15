import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Build a nested tree from a flat array of sections.
 * Returns only top-level sections (parentId === null) with children nested.
 */
function buildSectionTree(sections: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const map = new Map<string, Record<string, unknown>>();
    const roots: Array<Record<string, unknown>> = [];

    for (const s of sections) {
        map.set(s.id as string, { ...s, children: [] });
    }

    for (const s of sections) {
        const node = map.get(s.id as string)!;
        if (s.parentId && map.has(s.parentId as string)) {
            const parent = map.get(s.parentId as string)!;
            (parent.children as Array<Record<string, unknown>>).push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
}

/**
 * GET /api/cms/manual/chapters
 *
 * List all chapters with nested section tree.
 * Public users see published only. Admins see all.
 */
export async function GET() {
    try {
        const session = await auth();
        const isAdmin = (session?.user as Record<string, unknown>)?.role === "ADMIN";

        const where = isAdmin ? {} : { published: true };

        const chapters = await prisma.manualChapter.findMany({
            where,
            orderBy: { sortOrder: "asc" },
            include: {
                sections: {
                    where: isAdmin ? {} : { published: true },
                    orderBy: { sortOrder: "asc" },
                    select: {
                        id: true,
                        chapterId: true,
                        parentId: true,
                        title: true,
                        slug: true,
                        sortOrder: true,
                        published: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
            },
        });

        // Build tree for each chapter
        const result = chapters.map(ch => ({
            ...ch,
            sections: buildSectionTree(ch.sections as unknown as Array<Record<string, unknown>>),
        }));

        return NextResponse.json({ chapters: result });
    } catch (error) {
        console.error("[manual/chapters] GET error:", error);
        return NextResponse.json({ error: "Failed to load chapters" }, { status: 500 });
    }
}

/**
 * POST /api/cms/manual/chapters
 * Create a new chapter. Admin only.
 * Body: { title, slug?, icon?, sortOrder?, published? }
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const isAdmin = (session.user as Record<string, unknown>)?.role === "ADMIN";
        if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const body = await req.json();
        const { title, slug, icon, sortOrder, published } = body as {
            title: string;
            slug?: string;
            icon?: string;
            sortOrder?: number;
            published?: boolean;
        };

        if (!title?.trim()) {
            return NextResponse.json({ error: "Title is required" }, { status: 400 });
        }

        const finalSlug = (slug?.trim() || title.trim())
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .substring(0, 80);

        const existing = await prisma.manualChapter.findUnique({ where: { slug: finalSlug } });
        if (existing) {
            return NextResponse.json({ error: "A chapter with this slug already exists" }, { status: 409 });
        }

        const chapter = await prisma.manualChapter.create({
            data: {
                title: title.trim(),
                slug: finalSlug,
                icon: icon?.trim() || null,
                sortOrder: sortOrder ?? 0,
                published: published ?? false,
            },
        });

        return NextResponse.json({ chapter }, { status: 201 });
    } catch (error) {
        console.error("[manual/chapters] POST error:", error);
        return NextResponse.json({ error: "Failed to create chapter" }, { status: 500 });
    }
}
