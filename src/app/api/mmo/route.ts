import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** GET /api/mmo — Public: list active categories with available stock count */
export async function GET() {
    try {
        const categories = await prisma.mmoProductCategory.findMany({
            where: { active: true },
            orderBy: { sortOrder: "asc" },
            select: {
                id: true,
                slug: true,
                name: true,
                description: true,
                imageUrl: true,
                schema: true,
                pricePerUnit: true,
                _count: {
                    select: {
                        items: { where: { sold: false } },
                    },
                },
            },
        });

        const result = categories.map((c: { id: string; slug: string; name: string; description: string | null; imageUrl: string | null; schema: string; pricePerUnit: number; _count: { items: number } }) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
            description: c.description,
            imageUrl: c.imageUrl,
            fields: c.schema.split("|"),
            pricePerUnit: c.pricePerUnit,
            availableStock: c._count.items,
        }));

        return NextResponse.json(result);
    } catch (err: unknown) {
        console.error("[GET /api/mmo]", err);
        return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
    }
}
