import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { proxyFilterSchema } from '@/lib/validation';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        const parsed = proxyFilterSchema.safeParse({
            protocol: searchParams.get('protocol') || undefined,
            location: searchParams.get('location') || undefined,
            page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
            limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 20,
        });

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid filters' }, { status: 400 });
        }

        const { protocol, location, page, limit } = parsed.data;
        const skip = (page - 1) * limit;

        const [proxies, total] = await Promise.all([
            prisma.proxyAccount.findMany({
                where: {
                    active: true,
                    ...(protocol && { protocol }),
                    ...(location && { location }),
                },
                select: {
                    id: true,
                    protocol: true,
                    location: true,
                    host: true,
                    port: true,
                    createdAt: true,
                    expiresAt: true,
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.proxyAccount.count({
                where: {
                    active: true,
                    ...(protocol && { protocol }),
                    ...(location && { location }),
                },
            }),
        ]);

        return NextResponse.json({
            proxies,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Proxy fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
