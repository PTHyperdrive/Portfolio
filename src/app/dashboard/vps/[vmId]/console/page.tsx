"use client";

import { useEffect, useRef, useState, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Script from "next/script";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface NoVncTicket {
    ticket: string;
    password: string;
    port: number;
    wsUrl: string;
    node: string;
    vmId: string;
}

// RFB is loaded via <Script> from public/novnc-rfb.js (pre-bundled IIFE).
// The bundle sets window.RFBModule = { default: RFB }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RFBConstructor = new (target: HTMLElement, url: string, options?: Record<string, unknown>) => any;

declare global {
    interface Window {
        RFBModule?: { default: RFBConstructor };
    }
}

export default function ConsolePage({ params }: { params: Promise<{ vmId: string }> }) {
    const { vmId } = use(params);
    const searchParams = useSearchParams();
    const node = searchParams.get("node") ?? "";

    const viewerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rfbRef = useRef<any>(null);

    const [status, setStatus] = useState<ConnectionStatus>("connecting");
    const [statusMsg, setStatusMsg] = useState("Loading noVNC…");
    const [vmName, setVmName] = useState(`VM ${vmId}`);
    const [scriptReady, setScriptReady] = useState(false);
    const [isPoppedOut, setIsPoppedOut] = useState(false);

    const connect = useCallback(async () => {
        if (!viewerRef.current) return;

        // Wait for the IIFE script to load
        const RFB = window.RFBModule?.default;
        if (!RFB) {
            setStatus("error");
            setStatusMsg("noVNC library failed to load");
            return;
        }

        setStatus("connecting");
        setStatusMsg("Fetching console ticket…");

        try {
            // ── 1. Fetch the noVNC ticket from our backend ───────────────
            const res = await fetch(`/api/proxmox/vms/${vmId}/console/novnc`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node }),
            });

            if (!res.ok) {
                const err = await res.json() as { error?: string };
                throw new Error(err.error ?? "Failed to obtain console ticket");
            }

            const data = await res.json() as NoVncTicket;

            // Try to get a readable VM name from the list API
            try {
                const vmRes = await fetch(`/api/proxmox/vms/${vmId}?node=${node}`);
                if (vmRes.ok) {
                    const vm = await vmRes.json() as { name?: string };
                    if (vm.name) setVmName(vm.name);
                }
            } catch { /* non-critical — keep the fallback name */ }

            setStatusMsg("Opening WebSocket connection…");

            // ── 2. Disconnect any lingering connection ────────────────────
            try { rfbRef.current?.disconnect(); } catch { /* already disconnected */ }
            rfbRef.current = null;

            // ── 3. Initialise RFB ────────────────────────────────────────
            if (!viewerRef.current) return; // guard: unmounted during async ops

            // data.wsUrl is a path like /novnc/... — prepend the current origin
            const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const fullWsUrl = `${wsProtocol}//${window.location.host}${data.wsUrl}`;

            const rfb = new RFB(viewerRef.current, fullWsUrl, {
                credentials: { username: "", password: data.password, target: "" },
            });

            // ── 4. Enable viewport scaling ───────────────────────────────
            rfb.scaleViewport = true;   // Scales canvas to fit the container
            rfb.resizeSession = true;   // Adjusts if the VM changes resolution

            rfb.addEventListener("connect", () => {
                setStatus("connected");
                setStatusMsg("Connected");
            });

            rfb.addEventListener("disconnect", () => {
                setStatus("disconnected");
                setStatusMsg("Disconnected");
            });

            rfbRef.current = rfb;

        } catch (err) {
            setStatus("error");
            setStatusMsg(err instanceof Error ? err.message : "Connection failed");
        }
    }, [vmId, node]);

    // Auto-connect once the script has loaded
    useEffect(() => {
        if (scriptReady) {
            void connect();
        }
        return () => {
            try { rfbRef.current?.disconnect(); } catch { /* already disconnected */ }
            rfbRef.current = null;
        };
    }, [connect, scriptReady]);

    const handleCtrlAltDel = () => {
        rfbRef.current?.sendCtrlAltDel();
    };

    const handlePopOut = () => {
        const popout = window.open(
            `/console-window/${vmId}?node=${node}`,
            "vnc_popout",
            "width=1280,height=800,menubar=no,toolbar=no,location=no,status=no"
        );
        if (popout) {
            setIsPoppedOut(true);
            // Disconnect the embedded console — the pop-out will create its own
            try { rfbRef.current?.disconnect(); } catch { /* ok */ }
            rfbRef.current = null;

            // Watch for the pop-out window closing
            const check = setInterval(() => {
                if (popout.closed) {
                    clearInterval(check);
                    setIsPoppedOut(false);
                    void connect();
                }
            }, 1000);
        }
    };

    // ── Status dot colour ─────────────────────────────────────────────
    const dotColor: Record<ConnectionStatus, string> = {
        connecting: "#f59e0b",
        connected: "#00ff88",
        disconnected: "#ef4444",
        error: "#ef4444",
    };
    const dotGlow: Record<ConnectionStatus, string> = {
        connecting: "0 0 8px #f59e0b66",
        connected: "0 0 12px #00ff88aa",
        disconnected: "none",
        error: "none",
    };

    return (
        <div style={{ minHeight: "100vh", background: "#0d1117", padding: "24px", fontFamily: "var(--font-inter), sans-serif" }}>

            {/* Load pre-bundled noVNC (IIFE → window.RFBModule) */}
            <Script
                src="/novnc-rfb.js"
                strategy="afterInteractive"
                onLoad={() => setScriptReady(true)}
                onError={() => {
                    setStatus("error");
                    setStatusMsg("Failed to load noVNC library");
                }}
            />

            {/* ── Header ──────────────────────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <Link
                        href={`/dashboard/vps/${vmId}?node=${node}&tab=console`}
                        style={{ color: "var(--text-muted)", fontSize: "0.85rem", textDecoration: "none" }}
                    >
                        ← Back to {vmName}
                    </Link>
                    <span style={{ color: "var(--glass-border)" }}>|</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {/* Animated pulsing dot for connecting state */}
                        <div style={{
                            width: 10, height: 10, borderRadius: "50%",
                            background: isPoppedOut ? "#a78bfa" : dotColor[status],
                            boxShadow: isPoppedOut ? "0 0 8px #a78bfa66" : dotGlow[status],
                            animation: status === "connecting" && !isPoppedOut ? "pulse 1.5s ease-in-out infinite" : "none",
                        }} />
                        <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                            {vmName}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            · {isPoppedOut ? "Console in pop-out window" : statusMsg}
                        </span>
                    </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                    <button
                        onClick={handleCtrlAltDel}
                        disabled={status !== "connected" || isPoppedOut}
                        style={{
                            padding: "8px 16px", borderRadius: 6, fontSize: "0.82rem", fontWeight: 600,
                            border: "1px solid var(--glass-border)", background: "rgba(255,255,255,0.05)",
                            color: status === "connected" && !isPoppedOut ? "var(--text-secondary)" : "var(--text-muted)",
                            cursor: status === "connected" && !isPoppedOut ? "pointer" : "not-allowed",
                            opacity: status === "connected" && !isPoppedOut ? 1 : 0.45,
                            transition: "all 0.15s",
                        }}
                    >
                        ⌨️ Ctrl+Alt+Del
                    </button>
                    <button
                        onClick={handlePopOut}
                        disabled={isPoppedOut}
                        style={{
                            padding: "8px 16px", borderRadius: 6, fontSize: "0.82rem", fontWeight: 600,
                            border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.08)",
                            color: isPoppedOut ? "var(--text-muted)" : "#a78bfa",
                            cursor: isPoppedOut ? "not-allowed" : "pointer",
                            opacity: isPoppedOut ? 0.5 : 1, transition: "all 0.15s",
                        }}
                    >
                        ⧉ {isPoppedOut ? "Popped Out" : "Pop Out"}
                    </button>
                    <button
                        onClick={() => void connect()}
                        disabled={status === "connecting" || isPoppedOut}
                        style={{
                            padding: "8px 16px", borderRadius: 6, fontSize: "0.82rem", fontWeight: 600,
                            border: "1px solid rgba(0,240,255,0.25)", background: "rgba(0,240,255,0.07)",
                            color: "var(--accent-cyan)", cursor: status === "connecting" || isPoppedOut ? "not-allowed" : "pointer",
                            opacity: status === "connecting" || isPoppedOut ? 0.5 : 1, transition: "all 0.15s",
                        }}
                    >
                        ↺ Reconnect
                    </button>
                </div>
            </div>

            {/* ── noVNC Canvas Container ─────────────────────────────── */}
            <div style={{
                width: "100%", height: "75vh", minHeight: 500,
                background: "#000",
                borderRadius: 10,
                border: "1px solid #334155",
                overflow: "hidden",
                position: "relative",
                display: "flex", alignItems: "center", justifyContent: "center",
            }}>
                {/* The RFB library will inject a <canvas> into this div */}
                <div
                    ref={viewerRef}
                    style={{ width: "100%", height: "100%" }}
                />

                {/* Overlay: popped-out state */}
                {isPoppedOut && (
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.9)", backdropFilter: "blur(6px)", gap: 16,
                    }}>
                        <div style={{ fontSize: "3rem" }}>⧉</div>
                        <p style={{ fontWeight: 700, color: "#a78bfa", fontSize: "1.1rem" }}>
                            Console is in pop-out window
                        </p>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", maxWidth: 400, textAlign: "center" }}>
                            Close the pop-out window to return the console here
                        </p>
                    </div>
                )}

                {/* Overlay shown while not yet connected */}
                {!isPoppedOut && status !== "connected" && (
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
                        gap: 16,
                    }}>
                        {status === "connecting" && (
                            <>
                                <div style={{ fontSize: "2.5rem" }}>🖥️</div>
                                <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "1rem" }}>
                                    {statusMsg}
                                </p>
                                <div style={{
                                    width: 40, height: 40, border: "3px solid rgba(0,240,255,0.2)",
                                    borderTopColor: "var(--accent-cyan)", borderRadius: "50%",
                                    animation: "spin 0.9s linear infinite",
                                }} />
                            </>
                        )}
                        {(status === "disconnected" || status === "error") && (
                            <>
                                <div style={{ fontSize: "2.5rem" }}>{status === "error" ? "⚠️" : "🔌"}</div>
                                <p style={{ fontWeight: 700, color: status === "error" ? "#f87171" : "var(--text-primary)", fontSize: "1rem" }}>
                                    {status === "error" ? "Connection Error" : "Disconnected"}
                                </p>
                                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", maxWidth: 400, textAlign: "center" }}>
                                    {statusMsg}
                                </p>
                                <button
                                    onClick={() => void connect()}
                                    className="btn btn-primary"
                                    style={{ marginTop: 8 }}
                                >
                                    ↺ Try Again
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Inline keyframe animations */}
            <style>{`
                @keyframes spin   { to { transform: rotate(360deg); } }
                @keyframes pulse  { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
            `}</style>
        </div>
    );
}
