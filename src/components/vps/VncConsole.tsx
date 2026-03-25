"use client";

import { useState, useEffect, useRef } from "react";

interface VncConsoleProps {
    vmId: string;
    node: string;
}

// noVNC ESM source served from public/novnc/core/ (static files)
// Browser never sees Proxmox host in network inspection
const NOVNC_RFB_URL = "/novnc/core/rfb.js";


export default function VncConsole({ vmId, node }: VncConsoleProps) {
    const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
    const [error, setError] = useState("");
    const [isFullscreen, setIsFullscreen] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rfbRef = useRef<any>(null);
    const connectionRequested = useRef(false);

    const connect = async (isRetry = false) => {
        if (!isRetry && connectionRequested.current) return;
        connectionRequested.current = true;

        setStatus("connecting");
        setError("");

        try {
            // 1. Get VNC ticket from our API
            const res = await fetch("/api/proxmox/vnc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vmId, node }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to get VNC ticket");
            }

            const { ticket, port, password } = await res.json();

            // 2. Load noVNC library dynamically from our server's public directory
            // This bypasses webpack bundling issues and avoids external CDNs
            const noVNC = await import(/* webpackIgnore: true */ NOVNC_RFB_URL);

            // 3. Close existing connection if any
            if (rfbRef.current) {
                rfbRef.current.disconnect();
                rfbRef.current = null;
            }

            // Wake up the Next.js API route to attach the WebSocket upgrade listener
            // (Pages API routes don't natively intercept ws:// until initialized)
            await fetch("/api/proxmox/vnc-proxy").catch(() => { });

            // 4. Construct WebSocket URL pointing to our Next.js API route proxy
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            // The ticket is likely already URL safe from Proxmox, but let's ensure it's not double-encoded 
            const safeTicket = typeof ticket === 'string' && ticket.includes('%3A')
                ? ticket // Already encoded
                : encodeURIComponent(ticket);

            const wsUrl = `${protocol}//${window.location.host}/api/proxmox/vnc-proxy?node=${node}&vmId=${vmId}&port=${port}&vncticket=${safeTicket}`;

            if (!canvasRef.current) throw new Error("Canvas container not ready");

            // Suppress the harmless noVNC "secure context" warning which triggers Next.js Error Overlay on http://
            const originalConsoleError = console.error;
            console.error = (...args: any[]) => {
                if (typeof args[0] === "string" && args[0].includes("secure context")) return;
                originalConsoleError.apply(console, args);
            };

            // 5. Create RFB connection — noVNC creates its own canvas inside the div
            // IMPORTANT: With generate-password=1, Proxmox uses the ticket for the WS handshake,
            // and the generated 10-second password specifically for the VNC RFB protocol handshake.
            const rfb = new noVNC.default(canvasRef.current, wsUrl, {
                credentials: { password: password || ticket },
            });

            // Restore original console.error
            console.error = originalConsoleError;

            rfb.scaleViewport = true;
            rfb.resizeSession = true;

            // 6. Handle events
            rfb.addEventListener("connect", () => {
                setStatus("connected");
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rfb.addEventListener("disconnect", (e: any) => {
                setStatus("error");
                if (e.detail.clean) {
                    setError("Connection closed normally");
                } else {
                    setError("Connection lost unexpectedly");
                }
            });

            rfbRef.current = rfb;

        } catch (err) {
            console.error("VNC Setup Error:", err);
            setError(err instanceof Error ? err.message : "Failed to load VNC console");
            setStatus("error");
        }
    };

    useEffect(() => {
        connect();

        // Cleanup on unmount
        return () => {
            if (rfbRef.current) {
                rfbRef.current.disconnect();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vmId, node]);

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // Listen for escape key to update fullscreen state
    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    const sendCtrlAltDel = () => {
        if (rfbRef.current) {
            rfbRef.current.sendCtrlAltDel();
        }
    };

    return (
        <div ref={containerRef} style={{ position: "relative" }}>
            {/* Toolbar */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 16px",
                background: "rgba(10, 10, 15, 0.9)",
                borderRadius: "var(--radius-md) var(--radius-md) 0 0",
                border: "1px solid var(--glass-border)",
                borderBottom: "none",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: status === "connected" ? "var(--accent-green)" :
                            status === "connecting" ? "var(--accent-orange)" : "var(--accent-magenta)",
                        boxShadow: status === "connected" ? "0 0 8px var(--accent-green)" : "none",
                    }} />
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        {status === "connected" ? "Secure Relay Active" :
                            status === "connecting" ? "Establishing Relay..." :
                                status === "error" ? "Connection Failed" : "Ready"}
                    </span>
                    <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        VM {vmId} @ {node}
                    </span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    {status === "connected" && (
                        <button onClick={sendCtrlAltDel} className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
                            ⎈ Ctrl+Alt+Del
                        </button>
                    )}
                    {(status === "error" || status === "idle") && (
                        <button onClick={() => connect(true)} className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
                            🔄 Retry
                        </button>
                    )}
                    <button onClick={toggleFullscreen} className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
                        {isFullscreen ? "⛶ Exit" : "⛶ Fullscreen"}
                    </button>
                </div>
            </div>

            {/* Console Area - noVNC injects canvas here */}
            <div style={{
                background: "#000",
                border: "1px solid var(--glass-border)",
                borderRadius: "0 0 var(--radius-md) var(--radius-md)",
                overflow: "hidden",
                minHeight: isFullscreen ? "100vh" : "500px",
                position: "relative",
            }}>
                {/* The div where noVNC will render the canvas */}
                <div
                    ref={canvasRef}
                    style={{
                        width: "100%",
                        height: isFullscreen ? "100vh" : "500px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                />

                {status === "connecting" && (
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.9)", zIndex: 10,
                    }}>
                        <div style={{ textAlign: "center" }}>
                            <div className="animate-glow" style={{
                                width: 56, height: 56, borderRadius: "14px",
                                background: "var(--gradient-primary)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "1.5rem", margin: "0 auto 16px",
                            }}>
                                🖥
                            </div>
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                                Connecting to hypervisor...
                            </p>
                        </div>
                    </div>
                )}

                {status === "error" && (
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.9)", zIndex: 10,
                    }}>
                        <div style={{ textAlign: "center", maxWidth: "400px" }}>
                            <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>⚠️</div>
                            <h3 style={{ marginBottom: "8px", color: "var(--accent-magenta)" }}>Connection Failed</h3>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "20px" }}>{error}</p>
                            <button onClick={() => connect(true)} className="btn btn-primary" style={{ padding: "10px 24px" }}>
                                Try Again
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
