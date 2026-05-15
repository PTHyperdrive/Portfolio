import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/cms/faq
 * List FAQ entries. Public users see published only. Admins see all.
 * Query params: category, published
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const category = searchParams.get("category");

        const session = await auth();
        const isAdmin = (session?.user as Record<string, unknown>)?.role === "ADMIN";

        const where: Record<string, unknown> = {};
        if (!isAdmin) {
            where.published = true;
        }
        if (category) {
            where.category = category;
        }

        const entries = await prisma.faqEntry.findMany({
            where,
            orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        });

        // Group by category for convenience
        const grouped: Record<string, typeof entries> = {};
        for (const e of entries) {
            if (!grouped[e.category]) grouped[e.category] = [];
            grouped[e.category].push(e);
        }

        return NextResponse.json({ entries, grouped });
    } catch (error) {
        console.error("[cms/faq] GET error:", error);
        return NextResponse.json({ error: "Failed to load FAQs" }, { status: 500 });
    }
}

/**
 * POST /api/cms/faq
 * Create a new FAQ entry. Admin only.
 * Body: { question, answer, category?, sortOrder?, published? }
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const isAdmin = (session.user as Record<string, unknown>)?.role === "ADMIN";
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const { question, answer, category, sortOrder, published } = body as {
            question: string;
            answer: string;
            category?: string;
            sortOrder?: number;
            published?: boolean;
        };

        if (!question?.trim()) {
            return NextResponse.json({ error: "Question is required." }, { status: 400 });
        }
        if (!answer?.trim()) {
            return NextResponse.json({ error: "Answer is required." }, { status: 400 });
        }

        const entry = await prisma.faqEntry.create({
            data: {
                question: question.trim(),
                answer: answer.trim(),
                category: category?.trim() || "General",
                sortOrder: sortOrder ?? 0,
                published: published ?? false,
            },
        });

        return NextResponse.json({ entry }, { status: 201 });
    } catch (error) {
        console.error("[cms/faq] POST error:", error);
        return NextResponse.json({ error: "Failed to create FAQ" }, { status: 500 });
    }
}
