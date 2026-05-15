import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/cms/posts
 *
 * List CMS posts. Supports filtering by type (NEWS, BLOG), published status,
 * and pagination. Public access returns only published posts; admin sees all.
 *
 * Query params: type, published, page, limit, search
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type")?.toUpperCase() as "NEWS" | "BLOG" | null;
        const publishedParam = searchParams.get("published");
        const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
        const search = searchParams.get("search")?.trim() || "";

        const session = await auth();
        const isAdmin = (session?.user as Record<string, unknown>)?.role === "ADMIN";

        // Non-admins can only see published posts
        const where: Record<string, unknown> = {};
        if (!isAdmin) {
            where.published = true;
        } else if (publishedParam !== null) {
            where.published = publishedParam === "true";
        }

        if (type && ["NEWS", "BLOG"].includes(type)) {
            where.type = type;
        }

        if (search) {
            where.OR = [
                { title: { contains: search } },
                { excerpt: { contains: search } },
            ];
        }

        const [posts, total] = await Promise.all([
            prisma.cmsPost.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    type: true,
                    title: true,
                    slug: true,
                    excerpt: true,
                    coverImage: true,
                    published: true,
                    createdAt: true,
                    updatedAt: true,
                    author: { select: { id: true, name: true } },
                },
            }),
            prisma.cmsPost.count({ where }),
        ]);

        return NextResponse.json({
            posts,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("[cms/posts] GET error:", error);
        return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
    }
}

/**
 * POST /api/cms/posts
 *
 * Create a new CMS post. Admin only.
 *
 * Body: { type, title, slug?, excerpt?, content, coverImage?, published? }
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const isAdmin = (session.user as Record<string, unknown>)?.role === "ADMIN";
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { type, title, slug, excerpt, content, coverImage, published } = body as {
            type: string;
            title: string;
            slug?: string;
            excerpt?: string;
            content: string;
            coverImage?: string;
            published?: boolean;
        };

        if (!type || !["NEWS", "BLOG"].includes(type.toUpperCase())) {
            return NextResponse.json({ error: "Invalid type. Must be NEWS or BLOG." }, { status: 400 });
        }
        if (!title?.trim()) {
            return NextResponse.json({ error: "Title is required." }, { status: 400 });
        }
        if (!content?.trim()) {
            return NextResponse.json({ error: "Content is required." }, { status: 400 });
        }

        // Auto-generate slug from title if not provided
        const finalSlug = (slug?.trim() || title.trim())
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .substring(0, 120);

        // Ensure slug uniqueness
        const existing = await prisma.cmsPost.findUnique({ where: { slug: finalSlug } });
        if (existing) {
            return NextResponse.json({ error: "A post with this slug already exists." }, { status: 409 });
        }

        const post = await prisma.cmsPost.create({
            data: {
                type: type.toUpperCase() as "NEWS" | "BLOG",
                title: title.trim(),
                slug: finalSlug,
                excerpt: excerpt?.trim() || null,
                content: content.trim(),
                coverImage: coverImage?.trim() || null,
                published: published ?? false,
                authorId: session.user.id,
            },
        });

        return NextResponse.json({ post }, { status: 201 });
    } catch (error) {
        console.error("[cms/posts] POST error:", error);
        return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
    }
}
