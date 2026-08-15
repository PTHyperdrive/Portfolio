import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { generatePKCE, buildClaudeAuthUrl } from "@/lib/claude-oauth";
import crypto from "crypto";

export async function POST(req: Request) {
    const { error } = await requireAdmin();
    if (error) return error;

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const redirectUri = `${protocol}://${host}/api/admin/ai/claude-oauth/callback`;

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(16).toString("hex");

    const authUrl = buildClaudeAuthUrl({
        redirectUri,
        codeChallenge,
        state,
    });

    return NextResponse.json({
        authUrl,
        codeVerifier,
        state,
        redirectUri,
    });
}
