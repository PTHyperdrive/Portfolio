/**
 * @deprecated — Use `audit()` from `@/lib/audit` instead.
 *
 * This file is kept only for backward compatibility during migration.
 * The old ActivityLog model has been replaced by AuditLog (ISO 27001).
 */

import { audit } from "@/lib/audit";

interface LogActivityParams {
    userId: string;
    action: string;
    service: string;
    status: "Success" | "Failed";
    req?: Request;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any;
}

/**
 * @deprecated Use `audit()` from `@/lib/audit` instead.
 * Maps old-style activity logs to the new AuditLog system.
 */
export async function logUserActivity({
    userId,
    action,
    service,
    status,
    req,
    details,
}: LogActivityParams): Promise<void> {
    // Map old action strings to AuditAction enum values
    void audit({
        userId,
        action: "LOGIN_SUCCESS", // fallback — callers should migrate to audit()
        resourceType: service,
        outcome: status === "Success" ? "SUCCESS" : "FAILED",
        metadata: { legacyAction: action, ...details },
        req,
    });
}
