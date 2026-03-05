import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { serviceFilterSchema } from '@/lib/validation';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        const parsed = serviceFilterSchema.safeParse({
            type: searchParams.get('type') || undefined,
            minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
            maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
            search: searchParams.get('search') || undefined,
        });

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid filters' }, { status: 400 });
        }

        const { type, minPrice, maxPrice, search } = parsed.data;

        const services = await prisma.service.findMany({
            where: {
                active: true,
                ...(type && { type }),
                ...(minPrice !== undefined && { price: { gte: minPrice } }),
                ...(maxPrice !== undefined && { price: { lte: maxPrice } }),
                ...(search && {
                    OR: [
                        { name: { contains: search } },
                        { description: { contains: search } },
                    ],
                }),
            },
            orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
        });

        return NextResponse.json({ services });
    } catch (error) {
        console.error('Service fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
