import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface Params { params: Promise<{ id: string }> }

/**
 * PATCH /api/cms/faq/[id]
 * Update a FAQ entry. Admin only.
 */
export async function PATCH(req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const isAdmin = (session.user as Record<string, unknown>)?.role === "ADMIN";
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existing = await prisma.faqEntry.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "FAQ entry not found" }, { status: 404 });
        }

        const body = await req.json();
        const { question, answer, category, sortOrder, published } = body as {
            question?: string;
            answer?: string;
            category?: string;
            sortOrder?: number;
            published?: boolean;
        };

        const entry = await prisma.faqEntry.update({
            where: { id },
            data: {
                ...(question !== undefined && { question: question.trim() }),
                ...(answer !== undefined && { answer: answer.trim() }),
                ...(category !== undefined && { category: category.trim() }),
                ...(sortOrder !== undefined && { sortOrder }),
                ...(published !== undefined && { published }),
            },
        });

        return NextResponse.json({ entry });
    } catch (error) {
        console.error("[cms/faq/[id]] PATCH error:", error);
        return NextResponse.json({ error: "Failed to update FAQ" }, { status: 500 });
    }
}

/**
 * DELETE /api/cms/faq/[id]
 * Delete a FAQ entry. Admin only.
 */
export async function DELETE(_req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const isAdmin = (session.user as Record<string, unknown>)?.role === "ADMIN";
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existing = await prisma.faqEntry.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "FAQ entry not found" }, { status: 404 });
        }

        await prisma.faqEntry.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[cms/faq/[id]] DELETE error:", error);
        return NextResponse.json({ error: "Failed to delete FAQ" }, { status: 500 });
    }
}
