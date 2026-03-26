import { prisma } from "@/lib/db";

interface LogActivityParams {
    userId: string;
    action: string;
    service: string;
    status: "Success" | "Failed";
    req?: Request;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any;
}

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

        if (req) {
            ipAddress =
                req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
                req.headers.get("x-real-ip") ??
                undefined;
            userAgent = req.headers.get("user-agent") ?? undefined;
        }

        await prisma.activityLog.create({
            data: {
                userId,
                action,
                service,
                status,
                ipAddress,
                userAgent,
                details: details ?? undefined,
            },
        });
    } catch (err) {
        // Never let logging crash the main flow
        console.error("[logger] Failed to write activity log:", err);
    }
}
