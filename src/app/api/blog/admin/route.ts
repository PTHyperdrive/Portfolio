import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/blog/admin — Admin only: list ALL posts (including drafts)
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user || (session.user as Record<string, unknown>).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const posts = await prisma.blogPost.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                slug: true,
                published: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return NextResponse.json(posts);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
    }
}
