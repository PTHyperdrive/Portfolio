"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface VncConsoleProps {
    vmId: string;
    node: string;
    vmName?: string;
}

declare global {
    interface Window {
        // noVNC's RFB class injected at runtime from CDN
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        RFB?: any;
    }
}

export default function VncConsole({ vmId, node, vmName }: VncConsoleProps) {
    const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
    const [error, setError] = useState("");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const rfbRef = useRef<unknown>(null);
    const screenRef = useRef<HTMLDivElement>(null);

    // Disconnect helper
    const disconnect = useCallback(() => {
        if (rfbRef.current) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (rfbRef.current as any).disconnect();
            } catch { /* ignore */ }
            rfbRef.current = null;
        }
    }, []);

    const connect = useCallback(async () => {
        disconnect();
        setStatus("connecting");
        setError("");

        try {
            // Step 1: Get VNC ticket from our API
            const res = await fetch("/api/proxmox/vnc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vmId, node }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to get VNC ticket");
            }

            const { ticket, port, pveHost, pvePort } = await res.json();

            // Step 2: Load noVNC RFB from CDN if not already loaded
            if (!window.RFB) {
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement("script");
                    script.src = "https://cdn.jsdelivr.net/npm/@novnc/novnc@1.4.0/core/rfb.js";
                    script.type = "module";
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error("Failed to load noVNC library"));
                    document.head.appendChild(script);
                });
                // Wait a tick for the module to register
                await new Promise((r) => setTimeout(r, 300));
            }

            if (!screenRef.current) throw new Error("Console container not ready");

            // Step 3: Build PVE websocket URL
            // PVE VNC websocket: wss://<host>:<port>/api2/json/nodes/<node>/qemu/<vmid>/vncwebsocket?port=<port>&vncticket=<ticket>
            const encodedTicket = encodeURIComponent(ticket);
            const wsUrl = `wss://${pveHost}:${pvePort}/api2/json/nodes/${node}/qemu/${vmId}/vncwebsocket?port=${port}&vncticket=${encodedTicket}`;

            // Step 4: Connect via RFB
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const RFB = (window as any).RFB;
            if (!RFB) {
                throw new Error("noVNC RFB class not available — try refreshing");
            }

            const rfb = new RFB(screenRef.current, wsUrl, {
                credentials: { password: ticket },
            });

            rfb.scaleViewport = true;
            rfb.resizeSession = true;
            rfb.background = "#000";

            rfb.addEventListener("connect", () => {
                setStatus("connected");
                setError("");
            });

            rfb.addEventListener("disconnect", (e: { detail: { clean: boolean } }) => {
                if (!e.detail.clean) {
                    setStatus("error");
                    setError("VNC session disconnected unexpectedly.");
                } else {
                    setStatus("idle");
                }
            });

            rfb.addEventListener("credentialsrequired", () => {
                rfb.sendCredentials({ password: ticket });
            });

            rfbRef.current = rfb;

        } catch (err) {
            setError(err instanceof Error ? err.message : "Connection failed");
            setStatus("error");
        }
    }, [vmId, node, disconnect]);

    useEffect(() => {
        connect();
        return () => disconnect();
    }, [connect, disconnect]);

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

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    const consoleHeight = isFullscreen ? "calc(100vh - 48px)" : "520px";

    return (
        <div ref={containerRef} style={{ position: "relative" }}>
            {/* Toolbar */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 16px",
                background: "rgba(10, 10, 15, 0.95)",
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
                        transition: "background 0.3s",
                    }} />
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        {status === "connected" ? "Console Connected" :
                            status === "connecting" ? "Connecting…" :
                                status === "error" ? "Connection Failed" : "Ready"}
                    </span>
                    {vmName && (
                        <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {vmName}
                        </span>
                    )}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    {(status === "error" || status === "idle") && (
                        <button onClick={connect} className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
                            🔄 Reconnect
                        </button>
                    )}
                    <button
                        onClick={() => {
                            // Send Ctrl+Alt+Del
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            if (rfbRef.current) (rfbRef.current as any).sendCtrlAltDel?.();
                        }}
                        className="btn btn-ghost"
                        style={{ padding: "4px 12px", fontSize: "0.78rem" }}
                        title="Send Ctrl+Alt+Del"
                    >
                        ⌨️ CAD
                    </button>
                    <button onClick={toggleFullscreen} className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
                        {isFullscreen ? "⛶ Exit" : "⛶ Fullscreen"}
                    </button>
                </div>
            </div>

            {/* Console Canvas Area */}
            <div style={{
                background: "#000",
                border: "1px solid var(--glass-border)",
                borderRadius: "0 0 var(--radius-md) var(--radius-md)",
                overflow: "hidden",
                height: consoleHeight,
                position: "relative",
            }}>
                {/* noVNC renders into this div */}
                <div
                    ref={screenRef}
                    style={{ width: "100%", height: "100%", background: "#111" }}
                />

                {/* Overlay states */}
                {status === "connecting" && (
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.88)", zIndex: 10,
                        pointerEvents: "none",
                    }}>
                        <div style={{ textAlign: "center" }}>
                            <div className="animate-glow" style={{
                                width: 56, height: 56, borderRadius: "14px",
                                background: "var(--gradient-primary)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "1.5rem", margin: "0 auto 16px",
                            }}>🖥</div>
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                                Connecting to VNC console…
                            </p>
                        </div>
                    </div>
                )}

                {status === "error" && (
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.92)", zIndex: 10,
                    }}>
                        <div style={{ textAlign: "center", maxWidth: "420px", padding: "0 24px" }}>
                            <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>⚠️</div>
                            <h3 style={{ marginBottom: "8px", color: "var(--accent-magenta)" }}>Console Error</h3>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "20px" }}>{error}</p>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "20px" }}>
                                Make sure the VM is running and that your browser allows connections to <strong>{typeof window !== "undefined" ? window.location.hostname : "the PVE host"}</strong>.
                            </p>
                            <button onClick={connect} className="btn btn-primary" style={{ padding: "10px 24px" }}>
                                Try Again
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
