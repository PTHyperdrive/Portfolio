import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/logger";

/**
 * POST /api/auth/log-login
 * Called client-side right after a successful signIn() to record the login event.
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ ok: false }, { status: 401 });
        }

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
