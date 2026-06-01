import { auth } from "@/lib/auth";
import { collectHealthSnapshot } from "@/lib/mikrotik";

/**
 * GET /api/admin/mikrotik/health — SSE stream of MikroTik health data.
 * Admin-only. Pushes a health snapshot every 30 seconds.
 * No aggressive polling — single SSE connection, server-driven interval.
 */
export async function GET() {
    const session = await auth();
    const role = (session?.user as Record<string, unknown>)?.role;
    if (!session?.user?.id || role !== "ADMIN") {
        return new Response("Unauthorized", { status: 401 });
    }

    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: unknown) => {
                if (closed) return;
                try {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
                    );
                } catch {
                    closed = true;
                }
            };

            // Send initial snapshot immediately
            try {
                const snapshot = await collectHealthSnapshot();
                send(snapshot);
            } catch (err) {
                send({
                    status: "error",
                    latencyMs: 0,
                    identity: "",
                    version: "",
                    uptime: "",
                    cpuLoad: 0,
                    cpuCount: 0,
                    memoryUsed: 0,
                    memoryTotal: 0,
                    boardName: "",
                    architecture: "",
                    interfaces: [],
                    vlanCount: 0,
                    firewallFilterCount: 0,
                    firewallNatCount: 0,
                    healthEntries: [],
                    timestamp: new Date().toISOString(),
                    error: err instanceof Error ? err.message : "Unknown",
                });
            }

            // Poll every 30 seconds
            const interval = setInterval(async () => {
                if (closed) {
                    clearInterval(interval);
                    return;
                }
                try {
                    const snapshot = await collectHealthSnapshot();
                    send(snapshot);
                } catch {
                    send({
                        status: "error",
                        timestamp: new Date().toISOString(),
                    });
                }
            }, 30_000);

            // Cleanup on stream cancel
            const cleanup = () => {
                closed = true;
                clearInterval(interval);
            };

            // AbortSignal not directly available on ReadableStream,
            // but the controller will throw on enqueue after close.
            // The interval self-cleans via the `closed` flag.
            void cleanup; // referenced by interval check
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
