import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptInventoryData } from "@/lib/mmo-crypto";

/** GET /api/mmo/inventory — Admin: list all categories with inventory counts */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user as { role?: string }).role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const categories = await prisma.mmoProductCategory.findMany({
            orderBy: { sortOrder: "asc" },
            include: {
                _count: {
                    select: {
                        items: true,
                    },
                },
            },
        });

        // Get per-category sold/unsold counts
        const result = await Promise.all(
            categories.map(async (cat) => {
                const unsold = await prisma.mmoInventoryItem.count({
                    where: { categoryId: cat.id, sold: false },
                });
                const sold = await prisma.mmoInventoryItem.count({
                    where: { categoryId: cat.id, sold: true },
                });
                return {
                    ...cat,
                    unsoldCount: unsold,
                    soldCount: sold,
                    totalCount: cat._count.items,
                };
            })
        );

        return NextResponse.json(result);
    } catch (err: unknown) {
        console.error("[GET /api/mmo/inventory]", err);
        return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
    }
}

/** POST /api/mmo/inventory — Admin: bulk-add inventory items
 *  Body: { categoryId: string, items: string[] }
 *  Each item string must match the category schema field count.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user as { role?: string }).role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const { categoryId, items } = await req.json();

        if (!categoryId || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "categoryId and non-empty items[] required" }, { status: 400 });
        }

        // Fetch the category to validate schema
        const category = await prisma.mmoProductCategory.findUnique({
            where: { id: categoryId },
        });
        if (!category) {
            return NextResponse.json({ error: "Category not found" }, { status: 404 });
        }

        const expectedFieldCount = category.schema.split("|").length;
        const errors: string[] = [];
        const validItems: string[] = [];

        for (let i = 0; i < items.length; i++) {
            const raw = (items[i] as string).trim();
            if (!raw) continue;
            const fieldCount = raw.split("|").length;
            if (fieldCount !== expectedFieldCount) {
                errors.push(`Line ${i + 1}: expected ${expectedFieldCount} fields, got ${fieldCount}`);
            } else {
                validItems.push(raw);
            }
        }

        if (errors.length > 0 && validItems.length === 0) {
            return NextResponse.json({ error: "All items invalid", details: errors }, { status: 400 });
        }

        // Batch create — encrypt each item's data at rest (AES-256-GCM)
        const result = await prisma.mmoInventoryItem.createMany({
            data: validItems.map((data) => ({
                categoryId,
                data: encryptInventoryData(data),
            })),
        });

        return NextResponse.json({
            created: result.count,
            errors: errors.length > 0 ? errors : undefined,
        }, { status: 201 });
    } catch (err: unknown) {
        console.error("[POST /api/mmo/inventory]", err);
        return NextResponse.json({ error: "Failed to add inventory" }, { status: 500 });
    }
}
