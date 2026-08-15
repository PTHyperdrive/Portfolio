import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyProof, vaultConfigured } from "@/lib/vault-auth";
import { audit } from "@/lib/audit";

/**
 * POST /api/vault/verify
 *
 * Trade a proof for a short-lived bearer token.
 *
 * The body carries no code — only HMAC(code, nonce) — so a captured request
 * yields nothing reusable, and the nonce it answers is already spent.
 *
 * The token is returned in the body rather than a Set-Cookie header on purpose:
 * the page keeps it in memory only, so closing the tab ends the session with
 * nothing left behind on the device.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
    id: z.string().trim().length(32),
    proof: z.string().trim().regex(/^[a-f0-9]{64}$/i, "Malformed proof"),
});

export async function POST(req: Request) {
    if (!vaultConfigured()) {
        return NextResponse.json({ error: "Unavailable" }, { status: 404 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Rejected" }, { status: 400 });
    }

    const result = await verifyProof(parsed.data.id, parsed.data.proof);

    if (!result.ok) {
        // One message for every failure. Distinguishing "wrong code" from
        // "expired nonce" would help someone tuning an attack and helps the
        // operator not at all — they simply try again.
        const status = result.reason === "locked" ? 429 : 401;
        return NextResponse.json(
            {
                error: result.reason === "locked"
                    ? "Too many failed attempts. Try again shortly."
                    : "Rejected.",
            },
            { status },
        );
    }

    void audit({
        userId: result.userId,
        action: "ADMIN_VAULT_LOGIN",
        resourceType: "Vault",
        req,
    });

    return NextResponse.json(
        { token: result.token, expiresInMs: result.expiresInMs },
        { headers: { "Cache-Control": "no-store" } },
    );
}
