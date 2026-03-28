import { headers } from "next/headers";
import { prisma } from "@/lib/db";

interface LogActivityParams {
    userId: string;
    action: string;
    service: string;
    status: "Success" | "Failed";
    /** Optional – pass the Route Handler's Request for header extraction */
    req?: Request;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any;
}

/**
 * logUserActivity
 *
 * Writes an ActivityLog record. IP address and User-Agent are automatically
 * extracted from the incoming request headers using two strategies (in order):
 *
 *   1. The `req` object passed by the caller (standard Route Handler Request).
 *   2. `next/headers` — Next.js server-side header store, which captures the
 *      real incoming request headers even when a reverse proxy does not set
 *      x-forwarded-for (e.g., during local development).
 *
 * Never throws — log failures must never crash the caller.
 */
export async function logUserActivity({
    userId,
    action,
    service,
    status,
    req,
    details,
}: LogActivityParams): Promise<void> {
    try {
        let ipAddress: string | undefined;
        let userAgent: string | undefined;

        // ── Strategy 1: from the explicit Request object ────────────────
        if (req) {
            const ff = req.headers.get("x-forwarded-for");
            ipAddress = ff
                ? ff.split(",")[0].trim()
                : (req.headers.get("x-real-ip") ?? undefined);
            userAgent = req.headers.get("user-agent") ?? undefined;
        }

        // ── Strategy 2: next/headers fallback ──────────────────────────
        // When running without a reverse proxy (e.g., local dev / direct Node),
        // x-forwarded-for is absent in the Request object. next/headers always
        // has access to the raw incoming headers for the current server context.
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
                // headers() throws outside a server context (e.g., during tests).
                // Silently skip — storing the log without IP/UA is better than crashing.
            }
        }

        await prisma.activityLog.create({
            data: {
                userId,
                action,
                service,
                status,
                ipAddress:  ipAddress  ?? null,
                userAgent:  userAgent  ?? null,
                details:    details    ?? undefined,
            },
        });
    } catch (err) {
        // Never let logging crash the main flow
        console.error("[logger] Failed to write activity log:", err);
    }
}
