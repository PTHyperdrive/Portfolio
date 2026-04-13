import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVMStatus } from "@/lib/proxmox";

/**
 * GET /api/proxmox/vms/[vmId]/stream
 *
 * Server-Sent Events (SSE) stream that pushes live Proxmox VM telemetry to
 * the browser every 10 seconds. Replaces the client-side setInterval polling
 * that previously fired a full round-trip GET request every 10 s.
 *
 * Protocol:
 *   - Response: Content-Type: text/event-stream
 *   - Each event: `data: <JSON payload>\n\n`
 *   - Client uses the browser-native EventSource API — no extra dependencies.
 *   - The stream auto-closes when the client disconnects (request.signal abort).
 *
 * Payload schema per event:
 *   { status, uptime, cpu, memory, maxmem, disk, maxdisk, netin, netout }
 *
 * Security:
 *   - Session is verified on connection — no token in the URL / query string.
 *   - VM ownership is verified against the database before the stream opens.
 *   - If either check fails the SSE stream sends an `error` event and closes.
 *
 * Note: This route MUST run in the Node.js runtime (not Edge) because it uses
 * a long-lived streaming response via ReadableStream + enqueue. Do not add
 * `export const runtime = "edge"` to this file.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ vmId: string }> }
) {
    // ── 1. Auth ──────────────────────────────────────────────────────
    const session = await auth();
    if (!session?.user?.id) {
        return new Response("Unauthorized", { status: 401 });
    }

    const { vmId } = await params;
    const node = request.nextUrl.searchParams.get("node") || "";

    if (!node) {
        return new Response("node query param is required", { status: 400 });
    }

    // ── 2. Ownership check ───────────────────────────────────────────
    const instance = await prisma.vpsInstance.findFirst({
        where: { vmId, node, userId: session.user.id },
        select: { id: true },
    });

    if (!instance) {
        return new Response("VM not found or access denied", { status: 404 });
    }

    // ── 3. Stream ────────────────────────────────────────────────────
    const PUSH_INTERVAL_MS = 10_000; // 10 s — conservative, resource-efficient

    const stream = new ReadableStream({
        async start(controller) {
            const encode = (payload: unknown) =>
                new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);

            const push = async () => {
                try {
                    const liveData = await getVMStatus(node, vmId);
                    controller.enqueue(encode(liveData));
                } catch {
                    // Proxmox temporarily unreachable — send a null pulse so
                    // the client knows the stream is still alive.
                    controller.enqueue(encode(null));
                }
            };

            // Send an immediate first event so the client UI doesn't wait 10 s
            await push();

            const interval = setInterval(push, PUSH_INTERVAL_MS);

            // ── 4. Cleanup on client disconnect ──────────────────────
            request.signal.addEventListener("abort", () => {
                clearInterval(interval);
                try { controller.close(); } catch { /* already closed */ }
            });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type":  "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection":    "keep-alive",
            // Prevent Nginx / proxies from buffering the stream
            "X-Accel-Buffering": "no",
        },
    });
}
