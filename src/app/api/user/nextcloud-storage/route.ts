import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
    validateNcExpansion,
    userToNcUsername,
    calcNcCost,
    provisionNcStorage,
    occFallbackCommand,
    NC_FREE_GB,
    NC_MAX_TOTAL_GB,
    NC_STEP_GB,
    STORAGE_PRICING,
    type StorageType,
} from "@/lib/nextcloud";

/**
 * Prerequisite gate: user must have ≥1 active VPS instance.
 * Minimum acceptable tier: any plan (Nano-NAT or above).
 */
async function checkVmPrerequisite(userId: string): Promise<boolean> {
    const count = await prisma.vpsInstance.count({
        where: {
            userId,
            status: { notIn: ["deleted", "suspended"] },
        },
    });
    return count > 0;
}

/**
 * GET /api/user/nextcloud-storage
 *
 * Returns the user's current Nextcloud storage record plus quota rules.
 * If no record exists yet, returns potential allocation info.
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record: any = await (prisma as any).userNextcloudStorage.findUnique({
        where: { userId },
    });

    const hasVm = await checkVmPrerequisite(userId);

    return NextResponse.json({
        provisioned:   !!record,
        eligible:      hasVm,
        maxTotalGb:    NC_MAX_TOTAL_GB,
        stepGb:        NC_STEP_GB,
        pricing:       STORAGE_PRICING,
        ...(record ? {
            ncUsername:  record.ncUsername,
            freeGb:      record.freeGb,
            paidGb:      record.paidGb,
            totalGb:     record.totalGb,
            remainingGb: NC_MAX_TOTAL_GB - record.totalGb,
        } : {
            ncUsername: null,
            freeGb:     NC_FREE_GB,
            paidGb:     0,
            totalGb:    0,
        }),
    });
}

/**
 * POST /api/user/nextcloud-storage
 *
 * Provision or expand Nextcloud cloud storage for the authenticated user.
 *
 * On first call (no existing record):
 *   - Checks VM prerequisite gate
 *   - Creates NC user with 5 GB free base quota
 *   - No credit deduction for the free tier
 *
 * On subsequent calls (expansion):
 *   - Body: { storageType: "nvme"|"sata"|"hdd", expandGb: number }
 *   - expandGb must be a multiple of 5 (e.g. 5, 10, 15 … 95)
 *   - Deducts credits, updates NC quota
 */
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // ── Check existing record ──────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: any = await (prisma as any).userNextcloudStorage.findUnique({
        where: { userId },
    });

    // ── Case 1: First-time provisioning (free 5 GB base) ──────────
    if (!existing) {
        const hasVm = await checkVmPrerequisite(userId);
        if (!hasVm) {
            return NextResponse.json(
                {
                    error:  "Nextcloud storage requires an active VM lease. " +
                            "Please provision at least one VM (minimum: Nano-NAT plan).",
                    action: "REDIRECT_TO_PLANS",
                },
                { status: 403 }
            );
        }

        const ncUsername = userToNcUsername(userId);

        // Provision on Nextcloud (non-fatal)
        let ncError: string | null = null;
        try {
            await provisionNcStorage(ncUsername, NC_FREE_GB);
        } catch (err) {
            ncError = err instanceof Error ? err.message : String(err);
            console.error("[nextcloud] Free tier provision failed:", err);
        }

        // Persist record
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any).userNextcloudStorage.create({
            data: {
                userId,
                ncUsername,
                freeGb:  NC_FREE_GB,
                paidGb:  0,
                totalGb: NC_FREE_GB,
            },
        });

        void audit({
            userId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            action:       "STORAGE_PURCHASE" as any,
            resourceType: "UserAccount",
            resourceId:   userId,
            metadata: { phase: "nextcloud-free", ncUsername, totalGb: NC_FREE_GB },
            req,
        });

        return NextResponse.json({
            success:     true,
            provisioned: true,
            ncUsername,
            totalGb:     NC_FREE_GB,
            paidGb:      0,
            cost:        0,
            message:     `${NC_FREE_GB} GB free cloud storage activated.`,
            ...(ncError && {
                warning:       "NC quota set failed. Contact support or use the manual command.",
                ncError,
                manualCommand: occFallbackCommand(ncUsername, NC_FREE_GB),
            }),
        });
    }

    // ── Case 2: Paid expansion ─────────────────────────────────────
    const body = await req.json() as { storageType?: string; expandGb?: number };
    const { storageType, expandGb } = body;

    const validTypes: StorageType[] = ["nvme", "sata", "hdd"];
    if (!storageType || !validTypes.includes(storageType as StorageType)) {
        return NextResponse.json(
            { error: `storageType must be one of: ${validTypes.join(", ")}.` },
            { status: 400 }
        );
    }
    if (typeof expandGb !== "number") {
        return NextResponse.json({ error: "expandGb is required." }, { status: 400 });
    }

    // Strict 5 GB increment + cap validation
    const validationError = validateNcExpansion(expandGb, existing.paidGb);
    if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 422 });
    }

    const type       = storageType as StorageType;
    const totalCost  = calcNcCost(type, expandGb);
    const newPaidGb  = existing.paidGb + expandGb;
    const newTotalGb = existing.freeGb + newPaidGb;

    // ── Credit check ───────────────────────────────────────────────
    const dbUser = await prisma.user.findUnique({
        where:  { id: userId },
        select: { credits: true, role: true },
    });
    const isAdmin = dbUser?.role === "ADMIN";

    if (!isAdmin && Number(dbUser?.credits ?? 0) < totalCost) {
        return NextResponse.json(
            {
                error: `Insufficient credits. Need ${totalCost.toLocaleString()} VND, ` +
                       `have ${Number(dbUser?.credits ?? 0).toLocaleString()} VND.`,
            },
            { status: 402 }
        );
    }

    // ── Atomic DB update ───────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).$transaction([
        // Update NC storage record
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).userNextcloudStorage.update({
            where: { userId },
            data:  { paidGb: newPaidGb, totalGb: newTotalGb },
        }),
        ...(!isAdmin ? [
            prisma.user.update({
                where: { id: userId },
                data:  { credits: { decrement: totalCost } },
            }),
            prisma.creditTransaction.create({
                data: {
                    userId,
                    type:    "VM_Deduction",
                    amount:  -totalCost,
                    details: `Nextcloud +${expandGb} GB ${type.toUpperCase()} — total ${newTotalGb} GB`,
                },
            }),
        ] : []),
    ]);

    // ── Provision on Nextcloud ─────────────────────────────────────
    const ncUsername = existing.ncUsername as string;
    let ncError: string | null = null;
    try {
        await provisionNcStorage(ncUsername, newTotalGb);
    } catch (err) {
        ncError = err instanceof Error ? err.message : String(err);
        console.error(`[nextcloud] Quota update failed for ${ncUsername}:`, err);
    }

    void audit({
        userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action:       "STORAGE_PURCHASE" as any,
        resourceType: "UserAccount",
        resourceId:   userId,
        metadata: {
            phase:       "nextcloud-expand",
            storageType: type,
            expandGb,
            newTotalGb,
            totalCost,
            ncProvisioned: !ncError,
        },
        req,
    });

    return NextResponse.json({
        success:     true,
        ncUsername,
        expandGb,
        storageType: type,
        newPaidGb,
        newTotalGb,
        totalCost,
        ...(ncError && {
            warning:       "Cloud storage purchased but Nextcloud quota update failed. Contact support.",
            ncError,
            manualCommand: occFallbackCommand(ncUsername, newTotalGb),
        }),
    });
}
