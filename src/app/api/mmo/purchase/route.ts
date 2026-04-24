import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const MAX_ITEMS_PER_ORDER = 1000;
const RETENTION_DAYS = 30;

/** POST /api/mmo/purchase — User: purchase items from a category
 *  Body: { categoryId: string, quantity: number }
 *  - Deducts credits atomically
 *  - Assigns next unsold items FIFO
 *  - Sets expiresAt = now + 30 days
 *  - Max 1000 items per order
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const { categoryId, quantity } = await req.json();
        const qty = Number(quantity);

        if (!categoryId || !qty || qty < 1) {
            return NextResponse.json({ error: "categoryId and quantity (>=1) required" }, { status: 400 });
        }
        if (qty > MAX_ITEMS_PER_ORDER) {
            return NextResponse.json({ error: `Maximum ${MAX_ITEMS_PER_ORDER} items per order` }, { status: 400 });
        }

        // Fetch category
        const category = await prisma.mmoProductCategory.findUnique({
            where: { id: categoryId, active: true },
        });
        if (!category) {
            return NextResponse.json({ error: "Category not found or inactive" }, { status: 404 });
        }

        const totalCost = category.pricePerUnit * qty;

        // Fetch user
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        if (user.credits < totalCost) {
            return NextResponse.json({
                error: "Insufficient credits",
                required: totalCost,
                available: user.credits,
            }, { status: 402 });
        }

        // Find unsold items FIFO
        const availableItems = await prisma.mmoInventoryItem.findMany({
            where: { categoryId, sold: false },
            orderBy: { createdAt: "asc" },
            take: qty,
            select: { id: true },
        });

        if (availableItems.length < qty) {
            return NextResponse.json({
                error: "Not enough stock",
                requested: qty,
                available: availableItems.length,
            }, { status: 409 });
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const itemIds = availableItems.map((i: { id: string }) => i.id);

        // Atomic transaction: deduct credits + mark items as sold
        await prisma.$transaction([
            prisma.user.update({
                where: { id: user.id },
                data: { credits: { decrement: totalCost } },
            }),
            prisma.mmoInventoryItem.updateMany({
                where: { id: { in: itemIds } },
                data: {
                    sold: true,
                    soldAt: now,
                    soldToId: user.id,
                    expiresAt,
                },
            }),
            prisma.creditTransaction.create({
                data: {
                    userId: user.id,
                    type: "MMO_Purchase",
                    amount: -totalCost,
                    details: `${qty}x ${category.name}`,
                },
            }),
        ]);

        // Fetch the purchased items' data to return to user
        const purchasedItems = await prisma.mmoInventoryItem.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, data: true, expiresAt: true },
        });

        return NextResponse.json({
            success: true,
            category: category.name,
            fields: category.schema.split("|"),
            quantity: qty,
            totalCost,
            expiresAt: expiresAt.toISOString(),
            items: purchasedItems.map((item: { id: string; data: string; expiresAt: Date | null }) => ({
                id: item.id,
                data: item.data,
                expiresAt: item.expiresAt,
            })),
        });
    } catch (err: unknown) {
        console.error("[POST /api/mmo/purchase]", err);
        return NextResponse.json({ error: "Purchase failed" }, { status: 500 });
    }
}
