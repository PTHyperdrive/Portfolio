import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

/**
 * Parse the notrespond-meta block appended by the rich blog editor.
 * Format (appended to content):
 *   \n\n<!--notrespond-meta:{"tags":[...],"publisher":"..."}-->
 *
 * Returns { tags, publisher } or defaults when absent.
 * Non-fatal: malformed blocks are silently ignored.
 */
function parseMeta(content: string): { tags: string[]; publisher: string } {
    const match = content.match(/<!--notrespond-meta:(.*?)-->/);
    if (!match) return { tags: [], publisher: "NOTRESPOND LABS" };
    try {
        const parsed = JSON.parse(match[1]) as { tags?: string[]; publisher?: string };
        return {
            tags:      Array.isArray(parsed.tags) ? parsed.tags : [],
            publisher: typeof parsed.publisher === "string" ? parsed.publisher : "NOTRESPOND LABS",
        };
    } catch {
        return { tags: [], publisher: "NOTRESPOND LABS" };
    }
}

// GET /api/blog — Public: list published BLOG posts (via CmsPost)
export async function GET() {
    try {
        const posts = await prisma.cmsPost.findMany({
            where: { published: true, type: "BLOG" },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                slug: true,
                excerpt: true,
                coverImage: true,
                content: true,
                published: true,
                createdAt: true,
                author: {
                    select: { name: true },
                },
            },
        });

        // Enrich each post with parsed tags + publisher from its content metadata block
        const enriched = posts.map((p) => ({ ...p, ...parseMeta(p.content) }));
        return NextResponse.json(enriched);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
    }
}

// POST /api/blog — Admin only: create a new BLOG post (via CmsPost)
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || (session.user as Record<string, unknown>).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json() as Record<string, unknown>;
        const { title, slug, excerpt, content, coverImage, published } = body as {
            title?: string; slug?: string; excerpt?: string;
            content?: string; coverImage?: string; published?: boolean;
        };

        if (!title || !slug || !content) {
            return NextResponse.json({ error: 'Title, slug, and content are required' }, { status: 400 });
        }

        // Check slug uniqueness
        const existing = await prisma.cmsPost.findUnique({ where: { slug } });
        if (existing) {
            return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
        }

        const post = await prisma.cmsPost.create({
            data: {
                type: "BLOG",
                title,
                slug,
                excerpt:    excerpt    || null,
                content,
                coverImage: coverImage || null,
                published:  published  ?? false,
                authorId:   session.user.id!,
            },
        });

        // Parse and return metadata so the client can use it immediately
        const meta = parseMeta(content);
        return NextResponse.json({ ...post, ...meta }, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
    }
}
