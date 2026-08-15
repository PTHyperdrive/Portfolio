import { NextResponse } from "next/server";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error_description") || searchParams.get("error");
    const state = searchParams.get("state");

    const html = `<!DOCTYPE html>
<html>
<head>
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
    <p>${error ? error : "Passing subscription key back to Admin AI Studio..."}</p>
  </div>
  <script>
    (function() {
      const payload = {
        type: "CLAUDE_OAUTH_RESPONSE",
        code: ${JSON.stringify(code)},
        error: ${JSON.stringify(error)},
        state: ${JSON.stringify(state)}
      };
      if (window.opener) {
        window.opener.postMessage(payload, "*");
        setTimeout(() => window.close(), 1200);
      }
    })();
  </script>
</body>
</html>`;

    return new NextResponse(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}
