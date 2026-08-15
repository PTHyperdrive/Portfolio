import { NextResponse } from "next/server";
import { issueChallenge, lockedOut, vaultConfigured } from "@/lib/vault-auth";

/**
 * POST /api/vault/challenge
 *
 * Hand out a single-use nonce for the keypad to answer.
 *
 * Unauthenticated by necessity — this is the front door. What keeps it from
 * being useful to a stranger is that a nonce alone proves nothing: answering it
 * requires the current TOTP code, and the endpoint stops responding once the
 * failure budget is spent.
 */

export const dynamic = "force-dynamic";

export async function POST() {
    if (!vaultConfigured()) {
        // Same shape as any other refusal. A distinct "not configured" reply
        // would tell an unauthenticated caller that the door exists at all.
        return NextResponse.json({ error: "Unavailable" }, { status: 404 });
    }
    if (lockedOut()) {
        return NextResponse.json(
            { error: "Too many failed attempts. Try again shortly." },
            { status: 429 },
        );
    }

    const { id, nonce, expiresInMs } = issueChallenge();
    return NextResponse.json({ id, nonce, expiresInMs }, {
        headers: { "Cache-Control": "no-store" },
    });
}
