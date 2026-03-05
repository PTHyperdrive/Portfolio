import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/blog — Public: list published posts
export async function GET() {
    try {
        const posts = await prisma.blogPost.findMany({
            where: { published: true },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                slug: true,
                excerpt: true,
                coverImage: true,
                published: true,
                createdAt: true,
                author: {
                    select: { name: true },
                },
            },
        });

        return NextResponse.json(posts);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
    }
}

// POST /api/blog — Admin only: create a new post
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || (session.user as Record<string, unknown>).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { title, slug, excerpt, content, coverImage, published } = body;

        if (!title || !slug || !content) {
            return NextResponse.json({ error: 'Title, slug, and content are required' }, { status: 400 });
        }

        // Check slug uniqueness
        const existing = await prisma.blogPost.findUnique({ where: { slug } });
        if (existing) {
            return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
        }

        const post = await prisma.blogPost.create({
            data: {
                title,
                slug,
                excerpt: excerpt || null,
                content,
                coverImage: coverImage || null,
                published: published ?? false,
                authorId: session.user.id!,
            },
        });

        return NextResponse.json(post, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
    }
}
