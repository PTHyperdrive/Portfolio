import { NextResponse } from "next/server";

/**
 * GET /api/admin/ai/claude-oauth/callback
 *
 * Where claude.ai lands after the admin approves the login. The page hands the
 * authorization code to the window that opened it and closes.
 *
 * The postMessage target is this deployment's own origin, never "*". An
 * authorization code is a credential in flight: broadcasting it to any origin
 * holding a handle on this window would hand it to whoever is listening.
 *
 * No auth guard here on purpose — the redirect arrives as a top-level
 * navigation from claude.ai, and the code alone is useless without the PKCE
 * verifier, which never leaves the server.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error_description") || searchParams.get("error");
    const state = searchParams.get("state");

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const origin = `${protocol}://${host}`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Claude Authentication Complete</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
    .card { background: #1e293b; padding: 2rem; border-radius: 1rem; border: 1px solid #334155; max-width: 400px; width: 90%; }
    .icon { font-size: 2.5rem; margin-bottom: 1rem; }
    h2 { margin: 0 0 0.5rem; font-size: 1.25rem; }
    p { font-size: 0.875rem; color: #94a3b8; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${error ? "❌" : "✅"}</div>
    <h2>${error ? "Authentication Failed" : "Authentication Successful"}</h2>
    <p>${error ? escapeHtml(error) : "Returning to Admin → AI Nodes…"}</p>
  </div>
  <script>
    (function () {
      var payload = {
        type: "CLAUDE_OAUTH_RESPONSE",
        code: ${JSON.stringify(code)},
        error: ${JSON.stringify(error)},
        state: ${JSON.stringify(state)}
      };
      if (window.opener) {
        window.opener.postMessage(payload, ${JSON.stringify(origin)});
        setTimeout(function () { window.close(); }, 1200);
      }
    })();
  </script>
</body>
</html>`;

    return new NextResponse(html, {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            // This page carries a credential; keep it out of caches entirely.
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
        },
    });
}

/** The provider's error text is attacker-influencable; never inline it raw. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
