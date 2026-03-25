"use client";

import { useState, useEffect, useRef } from "react";

interface VncConsoleProps {
    vmId: string;
    node: string;
}

export default function VncConsole({ vmId, node }: VncConsoleProps) {
    const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
    const [error, setError] = useState("");
    const [iframeUrl, setIframeUrl] = useState("");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const connect = async () => {
        setStatus("connecting");
        setError("");
        setIframeUrl("");

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

            const { ticket, port } = await res.json();

            // 2. Build the Proxmox built-in noVNC URL
            // Replace internal IP/port with the external one the user specified
            const externalDomain = "timox-1.notrespond.com:8000";

            const url = new URL(`https://${externalDomain}/`);
            url.searchParams.set("console", "kvm");
            url.searchParams.set("novnc", "1");
            url.searchParams.set("vmid", vmId);
            url.searchParams.set("vmname", `VM ${vmId}`); // optional
            url.searchParams.set("node", node);
            url.searchParams.set("resize", "scale");
            url.searchParams.set("cmd", "");
            url.searchParams.set("port", port.toString());
            url.searchParams.set("vncticket", ticket);

            setIframeUrl(url.toString());
            setStatus("connected");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load console");
            setStatus("error");
        }
    };

    useEffect(() => {
        connect();
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
                        {status === "connected" ? "Console Target Acquired" :
                            status === "connecting" ? "Generating Ticket..." :
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
                    {status === "connected" && (
                        <button onClick={connect} className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
                            🔄 Reconnect
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
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
            }}>
                {status === "connected" && iframeUrl && (
                    <div style={{ textAlign: "center", maxWidth: "400px" }}>
                        <div style={{ fontSize: "3rem", marginBottom: "20px" }}>🖥️</div>
                        <h3 style={{ marginBottom: "12px", color: "var(--text-primary)" }}>Console Ready</h3>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: "24px" }}>
                            Proxmox security policies (CSP) block embedding the console directly into this page. Please open the console in a new window.
                        </p>
                        <a
                            href={iframeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary"
                            style={{
                                padding: "12px 24px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px",
                                fontSize: "1rem",
                                textDecoration: "none"
                            }}
                        >
                            Open Web Console ↗
                        </a>
                    </div>
                )}

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
                                Loading VNC console from Proxmox...
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
                            <h3 style={{ marginBottom: "8px", color: "var(--accent-magenta)" }}>Failed to Load Console</h3>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "20px" }}>{error}</p>
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
