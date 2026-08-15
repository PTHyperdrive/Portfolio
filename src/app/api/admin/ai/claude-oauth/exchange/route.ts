import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api-auth";
import { exchangeClaudeCode } from "@/lib/claude-oauth";

const schema = z.object({
    code: z.string().trim().min(1),
    codeVerifier: z.string().trim().optional(),
    redirectUri: z.string().trim().optional(),
});

export async function POST(req: Request) {
    const { error } = await requireAdmin();
    if (error) return error;

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { code, codeVerifier, redirectUri } = parsed.data;

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const fallbackRedirectUri = `${protocol}://${host}/api/admin/ai/claude-oauth/callback`;

    try {
        const result = await exchangeClaudeCode({
            code,
            codeVerifier: codeVerifier || "",
            redirectUri: redirectUri || fallbackRedirectUri,
        });

        return NextResponse.json({
            ok: true,
            accessToken: result.accessToken,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to exchange authorization code" },
            { status: 400 },
        );
    }
}
