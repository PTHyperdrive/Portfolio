import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface Params { params: Promise<{ id: string }> }

/**
 * GET /api/cms/posts/[id]
 * Fetch a single post by ID or slug.
 */
export async function GET(_req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        const isAdmin = (session?.user as Record<string, unknown>)?.role === "ADMIN";

        // Try by ID first, then by slug
        const post = await prisma.cmsPost.findFirst({
            where: {
                OR: [{ id }, { slug: id }],
                ...(!isAdmin ? { published: true } : {}),
            },
            include: { author: { select: { id: true, name: true } } },
        });

        if (!post) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        return NextResponse.json({ post });
    } catch (error) {
        console.error("[cms/posts/[id]] GET error:", error);
        return NextResponse.json({ error: "Failed to load post" }, { status: 500 });
    }
}

/**
 * PATCH /api/cms/posts/[id]
 * Update a post. Admin only.
 */
export async function PATCH(req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const isAdmin = (session.user as Record<string, unknown>)?.role === "ADMIN";
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existing = await prisma.cmsPost.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        const body = await req.json();
        const { type, title, slug, excerpt, content, coverImage, published } = body as {
            type?: string;
            title?: string;
            slug?: string;
            excerpt?: string;
            content?: string;
            coverImage?: string;
            published?: boolean;
        };

        // Validate slug uniqueness if changed
        if (slug && slug !== existing.slug) {
            const dup = await prisma.cmsPost.findUnique({ where: { slug } });
            if (dup) {
                return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
            }
        }

        const post = await prisma.cmsPost.update({
            where: { id },
            data: {
                ...(type && ["NEWS", "BLOG"].includes(type.toUpperCase()) && { type: type.toUpperCase() as "NEWS" | "BLOG" }),
                ...(title !== undefined && { title: title.trim() }),
                ...(slug !== undefined && { slug: slug.trim() }),
                ...(excerpt !== undefined && { excerpt: excerpt?.trim() || null }),
                ...(content !== undefined && { content: content.trim() }),
                ...(coverImage !== undefined && { coverImage: coverImage?.trim() || null }),
                ...(published !== undefined && { published }),
            },
        });

        return NextResponse.json({ post });
    } catch (error) {
        console.error("[cms/posts/[id]] PATCH error:", error);
        return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
    }
}

/**
 * DELETE /api/cms/posts/[id]
 * Delete a post. Admin only.
 */
export async function DELETE(_req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const isAdmin = (session.user as Record<string, unknown>)?.role === "ADMIN";
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existing = await prisma.cmsPost.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        await prisma.cmsPost.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[cms/posts/[id]] DELETE error:", error);
        return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
    }
}
