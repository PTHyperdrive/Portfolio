import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** POST /api/mmo/category — Admin: create a new product category */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user as { role?: string }).role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const { name, slug, description, schema, pricePerUnit } = await req.json();

        if (!name || !slug || !schema || !pricePerUnit) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Validate schema is pipe-delimited with at least 1 field
        const fields = (schema as string).split("|").filter(Boolean);
        if (fields.length === 0) {
            return NextResponse.json({ error: "Schema must have at least one field" }, { status: 400 });
        }

        const category = await prisma.mmoProductCategory.create({
            data: {
                name,
                slug: (slug as string).toLowerCase().replace(/[^a-z0-9-]/g, ""),
                description: description || null,
                schema: fields.join("|"),
                pricePerUnit: Number(pricePerUnit),
            },
        });

        return NextResponse.json(category, { status: 201 });
    } catch (err: unknown) {
        console.error("[POST /api/mmo/category]", err);
        return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
    }
}

/** PATCH /api/mmo/category — Admin: update a category */
export async function PATCH(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user as { role?: string }).role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const { id, ...updates } = await req.json();
        if (!id) {
            return NextResponse.json({ error: "Category ID required" }, { status: 400 });
        }

        // Sanitize schema if provided
        if (updates.schema) {
            const fields = (updates.schema as string).split("|").filter(Boolean);
            if (fields.length === 0) {
                return NextResponse.json({ error: "Schema must have at least one field" }, { status: 400 });
            }
            updates.schema = fields.join("|");
        }

        const category = await prisma.mmoProductCategory.update({
            where: { id },
            data: updates,
        });

        return NextResponse.json(category);
    } catch (err: unknown) {
        console.error("[PATCH /api/mmo/category]", err);
        return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
    }
}

/** DELETE /api/mmo/category — Admin: soft-delete (deactivate) */
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user as { role?: string }).role !== "ADMIN") {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const { id } = await req.json();
        if (!id) {
            return NextResponse.json({ error: "Category ID required" }, { status: 400 });
        }

        await prisma.mmoProductCategory.update({
            where: { id },
            data: { active: false },
        });

        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        console.error("[DELETE /api/mmo/category]", err);
        return NextResponse.json({ error: "Failed to deactivate category" }, { status: 500 });
    }
}
