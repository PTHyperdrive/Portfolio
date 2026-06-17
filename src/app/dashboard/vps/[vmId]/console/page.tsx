"use client";

import { useEffect, useRef, useState, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { Keyboard, Maximize2, Monitor, AlertTriangle, Unplug, RotateCcw } from "lucide-react";
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
    const node = searchParams?.get("node") ?? "";
    const t = useThemeTokens();

    const viewerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rfbRef = useRef<any>(null);
    const startedRef = useRef(false);

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

            // data.wsUrl is a relative /novnc/... path — server.mjs proxies it to Proxmox
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

    // Auto-connect ONCE, after the script is ready and the node param is known.
    // The single-connect guard matters: useSearchParams() can yield node="" on
    // the first client render, then the real value — that flips `connect` and
    // re-runs this effect. Without the guard, the second connect tears down the
    // first WebSocket mid-handshake ("closed before established"), and the
    // replacement races a stale ticket. Disconnect only on real unmount.
    useEffect(() => {
        if (!scriptReady) {
            if (window.RFBModule) setScriptReady(true);
            return;
        }
        if (!node || startedRef.current) return;
        startedRef.current = true;
        void connect();
    }, [scriptReady, node, connect]);

    useEffect(() => () => {
        try { rfbRef.current?.disconnect(); } catch { /* already disconnected */ }
        rfbRef.current = null;
    }, []);

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

    // ── Status dot colour (theme-aware) ───────────────────────────────
    const dotColor: Record<ConnectionStatus, string> = {
        connecting: t.statusWarning,
        connected: t.statusSuccess,
        disconnected: t.statusError,
        error: t.statusError,
    };
    // Glow only on non-mono themes (mono is flat by design).
    const glow = (c: string) => (t.isMono ? "none" : `0 0 12px ${c}aa`);

    // Button shared style
    const btn = (active: boolean, accent: string): React.CSSProperties => ({
        padding: "8px 16px", borderRadius: t.buttonRadius, fontSize: "0.82rem", fontWeight: 600,
        border: `1px solid ${accent}55`, background: `${accent}14`,
        color: active ? accent : t.textMuted,
        cursor: active ? "pointer" : "not-allowed", opacity: active ? 1 : 0.5,
        transition: "all 0.15s", display: "inline-flex", alignItems: "center", gap: 6,
    });

    return (
        <div style={{ minHeight: "100vh", background: t.bgPrimary, padding: "24px", fontFamily: t.fontFamily }}>

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
                        style={{ color: t.textMuted, fontSize: "0.85rem", textDecoration: "none" }}
                    >
                        ← Back to {vmName}
                    </Link>
                    <span style={{ color: t.borderPrimary }}>|</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {/* Animated pulsing dot for connecting state */}
                        <div style={{
                            width: 10, height: 10, borderRadius: "50%",
                            background: isPoppedOut ? t.accentSecondary : dotColor[status],
                            boxShadow: isPoppedOut ? glow(t.accentSecondary) : glow(dotColor[status]),
                            animation: status === "connecting" && !isPoppedOut ? "pulse 1.5s ease-in-out infinite" : "none",
                        }} />
                        <span style={{ fontSize: "0.88rem", fontWeight: 600, color: t.textSecondary }}>
                            {vmName}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: t.textMuted }}>
                            · {isPoppedOut ? "Console in pop-out window" : statusMsg}
                        </span>
                    </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                    <button
                        onClick={handleCtrlAltDel}
                        disabled={status !== "connected" || isPoppedOut}
                        style={btn(status === "connected" && !isPoppedOut, t.textSecondary)}
                    >
                        <Keyboard style={{ width: 14, height: 14 }} /> Ctrl+Alt+Del
                    </button>
                    <button
                        onClick={handlePopOut}
                        disabled={isPoppedOut}
                        style={btn(!isPoppedOut, t.accentSecondary)}
                    >
                        <Maximize2 style={{ width: 14, height: 14 }} /> {isPoppedOut ? "Popped Out" : "Pop Out"}
                    </button>
                    <button
                        onClick={() => void connect()}
                        disabled={status === "connecting" || isPoppedOut}
                        style={btn(!(status === "connecting" || isPoppedOut), t.accentPrimary)}
                    >
                        <RotateCcw style={{ width: 14, height: 14 }} /> Reconnect
                    </button>
                </div>
            </div>

            {/* ── noVNC Canvas Container ─────────────────────────────── */}
            <div style={{
                width: "100%", height: "75vh", minHeight: 500,
                background: "#000",
                borderRadius: t.cardRadius,
                border: `1px solid ${t.borderPrimary}`,
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
                        <Maximize2 style={{ width: 48, height: 48, color: t.accentSecondary }} />
                        <p style={{ fontWeight: 700, color: t.accentSecondary, fontSize: "1.1rem" }}>
                            Console is in pop-out window
                        </p>
                        <p style={{ color: "#9a9a9a", fontSize: "0.85rem", maxWidth: 400, textAlign: "center" }}>
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
                                <Monitor style={{ width: 40, height: 40, color: t.accentPrimary }} />
                                <p style={{ fontWeight: 600, color: "#ededed", fontSize: "1rem" }}>
                                    {statusMsg}
                                </p>
                                <div style={{
                                    width: 40, height: 40, border: `3px solid ${t.accentPrimary}33`,
                                    borderTopColor: t.accentPrimary, borderRadius: "50%",
                                    animation: "spin 0.9s linear infinite",
                                }} />
                            </>
                        )}
                        {(status === "disconnected" || status === "error") && (
                            <>
                                {status === "error" ? <AlertTriangle style={{ width: 40, height: 40, color: t.statusError }} /> : <Unplug style={{ width: 40, height: 40, color: "#9a9a9a" }} />}
                                <p style={{ fontWeight: 700, color: status === "error" ? t.statusError : "#ededed", fontSize: "1rem" }}>
                                    {status === "error" ? "Connection Error" : "Disconnected"}
                                </p>
                                <p style={{ color: "#9a9a9a", fontSize: "0.85rem", maxWidth: 400, textAlign: "center" }}>
                                    {statusMsg}
                                </p>
                                <button
                                    onClick={() => void connect()}
                                    style={{ marginTop: 8, padding: "10px 22px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                                >
                                    <RotateCcw style={{ width: 14, height: 14 }} /> Try Again
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
