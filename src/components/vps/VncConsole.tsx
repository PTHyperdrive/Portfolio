"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface VncConsoleProps {
    vmId: string;
    node: string;
}

export default function VncConsole({ vmId, node }: VncConsoleProps) {
    const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
    const [error, setError] = useState("");
    const [vncUrl, setVncUrl] = useState("");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const connect = useCallback(async () => {
        setStatus("connecting");
        setError("");

        try {
            const res = await fetch("/api/proxmox/vnc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vmId, node }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to get VNC ticket");
            }

            const { ticket, port, pveHost, pvePort } = await res.json();
            const encodedTicket = encodeURIComponent(ticket);

            // Build noVNC URL pointing to Proxmox's built-in noVNC
            const noVncUrl = `https://${pveHost}:${pvePort}/?console=kvm&novnc=1&vmid=${vmId}&vmname=VPS&node=${node}&resize=scale&cmd=&port=${port}&vncticket=${encodedTicket}`;
            setVncUrl(noVncUrl);
            setStatus("connected");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Connection failed");
            setStatus("error");
        }
    }, [vmId, node]);

    useEffect(() => {
        connect();
    }, [connect]);

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
                        {status === "connected" ? "Console Connected" :
                            status === "connecting" ? "Connecting..." :
                                status === "error" ? "Connection Failed" : "Ready"}
                    </span>
                    <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        VM {vmId} @ {node}
                    </span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    {status === "error" && (
                        <button onClick={connect} className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
                            🔄 Retry
                        </button>
                    )}
                    <button onClick={toggleFullscreen} className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
                        {isFullscreen ? "⛶ Exit" : "⛶ Fullscreen"}
                    </button>
                </div>
            </div>

            {/* Console Area */}
            <div style={{
                background: "#000",
                border: "1px solid var(--glass-border)",
                borderRadius: "0 0 var(--radius-md) var(--radius-md)",
                overflow: "hidden",
                minHeight: isFullscreen ? "100vh" : "500px",
                position: "relative",
            }}>
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
                                Connecting to VNC console...
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
                            <button onClick={connect} className="btn btn-primary" style={{ padding: "10px 24px" }}>
                                Try Again
                            </button>
                        </div>
                    </div>
                )}

                {status === "connected" && vncUrl && (
                    <iframe
                        src={vncUrl}
                        style={{
                            width: "100%",
                            height: isFullscreen ? "calc(100vh - 48px)" : "500px",
                            border: "none",
                        }}
                        allow="clipboard-read; clipboard-write"
                        title={`VNC Console - VM ${vmId}`}
                    />
                )}
            </div>
        </div>
    );
}
