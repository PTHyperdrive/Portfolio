import { NextResponse } from "next/server";

/**
 * POST /api/tickets/upload — DEPRECATED
 *
 * This endpoint has been replaced by the centralized upload pipeline at:
 *   POST /api/uploads  (with context=TICKET)
 *
 * This stub remains for backward compatibility and returns a redirect notice.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
    return NextResponse.json({
        error: "This endpoint is deprecated. Use POST /api/uploads with context=TICKET instead.",
        redirect: "/api/uploads",
    }, { status: 410 }); // 410 Gone
}
