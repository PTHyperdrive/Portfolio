import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";

/**
 * GET /api/vps/jobs/[id] — provisioning job progress for the deploy UI.
 * Ownership-scoped; the UI polls this until the status is terminal.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const { id } = await params;

    const job = await prisma.provisioningJob.findFirst({
        where: { id, userId },
        select: {
            id: true,
            status: true,
            currentStep: true,
            stepLog: true,
            vpsInstanceId: true,
            error: true,
            createdAt: true,
            completedAt: true,
        },
    });

    if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job });
}
