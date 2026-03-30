/**
 * ISO 27018 — Data Protection & Right-to-Erasure Utilities
 *
 * Since AuditLog uses onDelete: Restrict, we cannot simply delete a user.
 * Instead we anonymize their PII while preserving the audit trail integrity.
 */

import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import crypto from "crypto";

/** Default retention period: 3 years (ISO 27001 requires a defined period) */
const DEFAULT_RETENTION_DAYS = 1095;

/**
 * Anonymize a user's PII while preserving audit trail integrity.
 *
 * Replaces email, name, and passwordHash with anonymized values.
 * Does NOT delete AuditLog records — they reference userId, which remains.
 *
 * @param userId - The user to anonymize
 * @param adminUserId - The admin performing the action (for audit trail)
 */
export async function anonymizeUser(
    userId: string,
    adminUserId: string,
): Promise<void> {
    const hash = crypto.createHash("sha256").update(userId).digest("hex").slice(0, 12);
    const anonEmail = `anon-${hash}@deleted.notrespond.com`;
    const anonName = `[Anonymized User ${hash}]`;

    await prisma.user.update({
        where: { id: userId },
        data: {
            email: anonEmail,
            name: anonName,
            passwordHash: null,
            twoFactorSecret: null,
            twoFactorEnabled: false,
            image: null,
        },
    });

    // Audit the anonymization itself
    void audit({
        userId: adminUserId,
        action: "USER_ANONYMIZED",
        resourceType: "UserAccount",
        resourceId: userId,
        metadata: { anonymizedEmail: anonEmail },
    });
}

/**
 * Purge audit logs older than the retention period.
 * ISO 27001 requires a defined retention policy — this enforces a maximum.
 *
 * @param retentionDays - Number of days to retain (default: 1095 = 3 years)
 * @returns Number of records purged
 */
export async function purgeExpiredAuditLogs(
    retentionDays: number = DEFAULT_RETENTION_DAYS,
): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await prisma.auditLog.deleteMany({
        where: {
            createdAt: { lt: cutoff },
        },
    });

    return result.count;
}
