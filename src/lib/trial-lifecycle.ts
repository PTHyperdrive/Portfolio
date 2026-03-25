import { prisma } from "@/lib/db";

const TRIAL_DAYS = 30;
const GRACE_DAYS = 3; // 30 + 3 = 33 days before deletion

export interface TrialStatus {
    hasUsedTrial: boolean;
    trialExpiresAt: Date | null;
    isActive: boolean;       // within the 30-day trial period
    isExpired: boolean;      // past 30 days
    isPastGrace: boolean;    // past 33 days — should destroy VM
    daysRemaining: number;   // days left in trial (<=0 means expired)
    daysUntilDeletion: number; // days until data is wiped (<=0 means deletion due)
}

/**
 * Returns detailed trial status for a user.
 * Callers should act on isPastGrace (destroy VM) or isExpired (lock VM).
 */
export async function getTrialStatus(userId: string): Promise<TrialStatus> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { hasUsedTrial: true, trialExpiresAt: true },
    });

    if (!user) {
        return {
            hasUsedTrial: false,
            trialExpiresAt: null,
            isActive: false,
            isExpired: false,
            isPastGrace: false,
            daysRemaining: 0,
            daysUntilDeletion: 0,
        };
    }

    const now = new Date();
    const expiresAt = user.trialExpiresAt;

    if (!user.hasUsedTrial || !expiresAt) {
        return {
            hasUsedTrial: user.hasUsedTrial,
            trialExpiresAt: null,
            isActive: false,
            isExpired: false,
            isPastGrace: false,
            daysRemaining: 0,
            daysUntilDeletion: 0,
        };
    }

    const deletionDate = new Date(expiresAt.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    const msPerDay = 24 * 60 * 60 * 1000;

    const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / msPerDay);
    const daysUntilDeletion = Math.ceil((deletionDate.getTime() - now.getTime()) / msPerDay);
    const isExpired = now > expiresAt;
    const isPastGrace = now > deletionDate;

    return {
        hasUsedTrial: true,
        trialExpiresAt: expiresAt,
        isActive: !isExpired,
        isExpired,
        isPastGrace,
        daysRemaining: Math.max(daysRemaining, 0),
        daysUntilDeletion: Math.max(daysUntilDeletion, 0),
    };
}

/**
 * Marks the trial as started for a user. Sets hasUsedTrial = true
 * and trialExpiresAt = now + 30 days.
 * Throws if the user has already used their trial.
 */
export async function startTrial(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { hasUsedTrial: true, role: true },
    });

    if (user?.hasUsedTrial && user.role !== "ADMIN") {
        throw new Error("Trial already used");
    }

    const trialExpiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.user.update({
        where: { id: userId },
        data: { hasUsedTrial: true, trialExpiresAt },
    });
}
