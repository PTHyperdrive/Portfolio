import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logUserActivity } from "@/lib/logger";

/**
 * POST /api/auth/log-login
 * Called client-side right after a successful signIn() to record the login event
 * and create a DeviceSession row for the Session Manager.
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ ok: false }, { status: 401 });
        }

        // ── Extract network metadata for the DeviceSession ───────────────
        const forwarded = req.headers.get("x-forwarded-for");
        const ipAddress = forwarded ? forwarded.split(",")[0].trim() : (req.headers.get("x-real-ip") ?? undefined);
        const userAgent = req.headers.get("user-agent") ?? undefined;

        // ── Create a new DeviceSession row ───────────────────────────────
        await prisma.deviceSession.create({
            data: {
                userId: session.user.id,
                ipAddress,
                userAgent,
            },
        });

        // ── Record the activity log ──────────────────────────────────────
        await logUserActivity({
            userId: session.user.id,
            action: "Login Success",
            service: "Auth",
            status: "Success",
            req,
            details: { email: session.user.email },
        });

        return NextResponse.json({ ok: true });
    } catch {
        // Non-critical — never crash the caller
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
