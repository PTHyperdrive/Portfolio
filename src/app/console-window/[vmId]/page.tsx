"use client";

import { useEffect, useRef, useState, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { useThemeTokens } from "@/lib/useThemeTokens";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface NoVncTicket {
    ticket: string;
    password: string;
    port: number;
    wsUrl: string;
    node: string;
    vmId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RFBConstructor = new (target: HTMLElement, url: string, options?: Record<string, unknown>) => any;

declare global {
    interface Window {
        RFBModule?: { default: RFBConstructor };
    }
}

export default function ConsoleWindowPage({ params }: { params: Promise<{ vmId: string }> }) {
    const { vmId } = use(params);
    const searchParams = useSearchParams();
    const node = searchParams.get("node") ?? "";
    const t = useThemeTokens();

    const viewerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rfbRef = useRef<any>(null);

    const [status, setStatus] = useState<ConnectionStatus>("connecting");
    const [statusMsg, setStatusMsg] = useState("Loading noVNC…");
    const [vmName, setVmName] = useState(`VM ${vmId}`);
    const [scriptReady, setScriptReady] = useState(false);

    const connect = useCallback(async () => {
        if (!viewerRef.current) return;

        const RFB = window.RFBModule?.default;
        if (!RFB) {
            setStatus("error");
            setStatusMsg("noVNC library failed to load");
            return;
        }

        setStatus("connecting");
        setStatusMsg("Fetching console ticket…");

        try {
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

            try {
                const vmRes = await fetch(`/api/proxmox/vms/${vmId}?node=${node}`);
                if (vmRes.ok) {
                    const vm = await vmRes.json() as { name?: string };
                    if (vm.name) {
                        setVmName(vm.name);
                        document.title = `${vm.name} — Console`;
                    }
                }
            } catch { /* non-critical */ }

            setStatusMsg("Opening WebSocket connection…");

            try { rfbRef.current?.disconnect(); } catch { /* ok */ }
            rfbRef.current = null;

            if (!viewerRef.current) return;

            const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const fullWsUrl = `${wsProtocol}//${window.location.host}${data.wsUrl}`;

            const rfb = new RFB(viewerRef.current, fullWsUrl, {
                credentials: { username: "", password: data.password, target: "" },
            });

            // Scale canvas to fill the entire pop-out window
            rfb.scaleViewport = true;
            rfb.resizeSession = true;

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

    useEffect(() => {
        if (!scriptReady && window.RFBModule) {
            setScriptReady(true);
            return;
        }
        if (scriptReady) {
            void connect();
        }
        return () => {
            try { rfbRef.current?.disconnect(); } catch { /* ok */ }
            rfbRef.current = null;
        };
    }, [connect, scriptReady]);

    // Rescale on window resize
    useEffect(() => {
        const handleResize = () => {
            if (rfbRef.current) {
                rfbRef.current.scaleViewport = true;
            }
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const handleCtrlAltDel = () => rfbRef.current?.sendCtrlAltDel();

    const dotColor: Record<ConnectionStatus, string> = {
        connecting: t.statusWarning,
        connected: t.statusSuccess,
        disconnected: t.statusError,
        error: t.statusError,
    };

    return (
        <div style={{
            width: "100vw", height: "100vh", background: "#000",
            display: "flex", flexDirection: "column", overflow: "hidden",
            fontFamily: t.fontFamily,
        }}>
            <Script
                src="/novnc-rfb.js"
                strategy="afterInteractive"
                onLoad={() => setScriptReady(true)}
                onError={() => {
                    setStatus("error");
                    setStatusMsg("Failed to load noVNC library");
                }}
            />

            {/* ── Compact toolbar ──────────────────────────────────────── */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 12px", background: t.bgSecondary,
                borderBottom: `1px solid ${t.borderPrimary}`, flexShrink: 0,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: dotColor[status],
                        boxShadow: !t.isMono ? `0 0 8px ${dotColor[status]}aa` : "none",
                        animation: status === "connecting" ? "pulse 1.5s ease-in-out infinite" : "none",
                    }} />
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: t.textPrimary }}>
                        {vmName}
                    </span>
                    <span style={{ fontSize: "0.72rem", color: t.textMuted }}>· {statusMsg}</span>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                    <button
                        onClick={handleCtrlAltDel}
                        disabled={status !== "connected"}
                        style={{
                            padding: "4px 10px", borderRadius: t.buttonRadius, fontSize: "0.72rem", fontWeight: 600,
                            border: `1px solid ${t.borderPrimary}`, background: `${t.textMuted}0a`,
                            color: status === "connected" ? t.textSecondary : t.textMuted,
                            cursor: status === "connected" ? "pointer" : "not-allowed",
                        }}
                    >
                        Ctrl+Alt+Del
                    </button>
                    <button
                        onClick={() => void connect()}
                        disabled={status === "connecting"}
                        style={{
                            padding: "4px 10px", borderRadius: t.buttonRadius, fontSize: "0.72rem", fontWeight: 600,
                            border: `1px solid ${t.accentPrimary}33`, background: `${t.accentPrimary}0a`,
                            color: t.accentPrimary, cursor: status === "connecting" ? "not-allowed" : "pointer",
                        }}
                    >
                        ↺ Reconnect
                    </button>
                </div>
            </div>

            {/* ── Full-bleed VNC canvas ─────────────────────────────────── */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                <div ref={viewerRef} style={{ width: "100%", height: "100%" }} />

                {status !== "connected" && (
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.9)", gap: 14,
                    }}>
                        {status === "connecting" && (
                            <>
                                <div style={{
                                    width: 32, height: 32, border: `3px solid ${t.accentPrimary}22`,
                                    borderTopColor: t.accentPrimary, borderRadius: "50%",
                                    animation: "spin 0.9s linear infinite",
                                }} />
                                <p style={{ fontSize: "0.85rem", color: t.textMuted }}>{statusMsg}</p>
                            </>
                        )}
                        {(status === "disconnected" || status === "error") && (
                            <>
                                <p style={{ fontSize: "0.9rem", fontWeight: 700, color: status === "error" ? t.statusError : t.textPrimary }}>
                                    {status === "error" ? "Connection Error" : "Disconnected"}
                                </p>
                                <p style={{ fontSize: "0.8rem", color: t.textMuted }}>{statusMsg}</p>
                                <button
                                    onClick={() => void connect()}
                                    style={{
                                        marginTop: 4, padding: "6px 16px", borderRadius: t.buttonRadius,
                                        fontSize: "0.8rem", fontWeight: 600,
                                        border: `1px solid ${t.accentPrimary}40`, background: `${t.accentPrimary}14`,
                                        color: t.accentPrimary, cursor: "pointer",
                                    }}
                                >
                                    ↺ Try Again
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin  { to { transform: rotate(360deg); } }
                @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
            `}</style>
        </div>
    );
}
