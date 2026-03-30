/**
 * ISO 27001 A.12.4 — Immutable Audit Logger
 *
 * Structured, fire-and-forget audit logging for compliance.
 * Every critical action (auth, VM lifecycle, console access, billing, admin)
 * is recorded with an immutable AuditLog row.
 *
 * Design principles:
 *  - Never throws — logging failures must never crash the main flow
 *  - Append-only — no update/delete functions
 *  - Strongly typed — actions use the AuditAction Prisma enum
 *  - Extracts IP/UA from the Request object and/or next/headers
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import type { AuditAction } from "@/generated/prisma";

export interface AuditEntry {
    userId: string;
    action: AuditAction;
    resourceType: string;
    resourceId?: string;
    outcome?: "SUCCESS" | "FAILED" | "DENIED";
    metadata?: Record<string, unknown>;
    /** Pass the Route Handler's Request for automatic IP/UA extraction */
    req?: Request;
}

/**
 * Write an immutable audit log entry.
 *
 * Usage:
 * ```ts
 * void audit({
 *   userId: session.user.id,
 *   action: "VM_CREATE",
 *   resourceType: "VirtualMachine",
 *   resourceId: String(vmid),
 *   req,
 * });
 * ```
 */
export async function audit(entry: AuditEntry): Promise<void> {
    try {
        let ipAddress: string | undefined;
        let userAgent: string | undefined;

        // ── Strategy 1: from the explicit Request object ────────────
        if (entry.req) {
            const ff = entry.req.headers.get("x-forwarded-for");
            ipAddress = ff
                ? ff.split(",")[0].trim()
                : (entry.req.headers.get("x-real-ip") ?? undefined);
            userAgent = entry.req.headers.get("user-agent") ?? undefined;
        }

        // ── Strategy 2: next/headers fallback ──────────────────────
        if (!ipAddress || !userAgent) {
            try {
                const headerStore = await headers();

                if (!ipAddress) {
                    const ff = headerStore.get("x-forwarded-for");
                    ipAddress = ff
                        ? ff.split(",")[0].trim()
                        : (headerStore.get("x-real-ip") ?? undefined);
                }

                if (!userAgent) {
                    userAgent = headerStore.get("user-agent") ?? undefined;
                }
            } catch {
                // headers() throws outside a server context — skip silently
            }
        }

        await prisma.auditLog.create({
            data: {
                userId:       entry.userId,
                action:       entry.action,
                resourceType: entry.resourceType,
                resourceId:   entry.resourceId ?? null,
                ipAddress:    ipAddress ?? null,
                userAgent:    userAgent ?? null,
                metadata:     entry.metadata ?? undefined,
                outcome:      entry.outcome ?? "SUCCESS",
            },
        });
    } catch (err) {
        // Never let audit logging crash the main flow
        console.error("[audit] Failed to write audit log:", err);
    }
}
