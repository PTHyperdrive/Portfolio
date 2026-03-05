import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/blog/[slug] — Public: get single post
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const post = await prisma.blogPost.findUnique({
            where: { slug },
            include: {
                author: {
                    select: { name: true, image: true },
                },
            },
        });

        if (!post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Only show unpublished posts to admins
        if (!post.published) {
            const session = await auth();
            if (!session?.user || (session.user as Record<string, unknown>).role !== 'ADMIN') {
                return NextResponse.json({ error: 'Post not found' }, { status: 404 });
            }
        }

        return NextResponse.json(post);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch post' }, { status: 500 });
    }
}

// PUT /api/blog/[slug] — Admin only: update post
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user || (session.user as Record<string, unknown>).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { slug } = await params;
        const body = await request.json();
        const { title, slug: newSlug, excerpt, content, coverImage, published } = body;

        const existing = await prisma.blogPost.findUnique({ where: { slug } });
        if (!existing) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Check new slug uniqueness if changed
        if (newSlug && newSlug !== slug) {
            const slugTaken = await prisma.blogPost.findUnique({ where: { slug: newSlug } });
            if (slugTaken) {
                return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
            }
        }

        const post = await prisma.blogPost.update({
            where: { slug },
            data: {
                ...(title && { title }),
                ...(newSlug && { slug: newSlug }),
                ...(excerpt !== undefined && { excerpt }),
                ...(content && { content }),
                ...(coverImage !== undefined && { coverImage }),
                ...(published !== undefined && { published }),
            },
        });

        return NextResponse.json(post);
    } catch {
        return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
    }
}

// DELETE /api/blog/[slug] — Admin only: delete post
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user || (session.user as Record<string, unknown>).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { slug } = await params;
        const existing = await prisma.blogPost.findUnique({ where: { slug } });
        if (!existing) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        await prisma.blogPost.delete({ where: { slug } });

        return NextResponse.json({ message: 'Post deleted' });
    } catch {
        return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
    }
}
