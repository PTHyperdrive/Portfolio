"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as TerminalIcon, Plug, PlugZap, AlertTriangle, RotateCcw, Users } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useIsMobile } from "@/lib/useIsMobile";

type Phase = "idle" | "connecting" | "attached" | "closed" | "error";

/**
 * Remote console onto a Claude Code session running on the operator's own VM.
 *
 * The terminal itself is xterm.js, loaded dynamically: it touches `window` at
 * import time and its CSS is a side-effect import, neither of which survives
 * server rendering.
 *
 * Colours come from the theme tokens, so the terminal follows Pro Dark/Light
 * and the mono themes rather than sitting on a black rectangle in a light UI.
 */
export default function AdminRelayPage() {
    const t = useThemeTokens();
    const isMobile = useIsMobile();

    const hostRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<{ dispose: () => void; write: (d: string | Uint8Array) => void } | null>(null);
    const fitRef = useRef<{ fit: () => void } | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const [phase, setPhase] = useState<Phase>("idle");
    const [agentUp, setAgentUp] = useState(false);
    const [viewers, setViewers] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const disconnect = useCallback(() => {
        wsRef.current?.close(1000, "closed by operator");
        wsRef.current = null;
        setPhase("closed");
    }, []);

    const connect = useCallback(async () => {
        setError(null);
        setPhase("connecting");

        // The ticket is minted by an admin-only route and lives 30 seconds.
        // A WebSocket cannot carry an Authorization header, so this is how the
        // socket server learns the caller is an administrator.
        let ticket: string;
        try {
            const res = await fetch("/api/admin/relay/ticket", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not get a relay ticket");
            ticket = data.ticket;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not get a relay ticket");
            setPhase("error");
            return;
        }

        const scheme = window.location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(`${scheme}://${window.location.host}/api/relay/console?ticket=${encodeURIComponent(ticket)}`);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
            setPhase("attached");
            // Tell the agent our size straight away, or Claude Code renders
            // its UI for whatever the pty was created with.
            const dims = fitRef.current as unknown as { proposeDimensions?: () => { cols: number; rows: number } } | null;
            const d = dims?.proposeDimensions?.();
            if (d) ws.send(JSON.stringify({ type: "resize", cols: d.cols, rows: d.rows }));
        };

        ws.onmessage = ev => {
            if (ev.data instanceof ArrayBuffer) {
                termRef.current?.write(new Uint8Array(ev.data));
                return;
            }
            try {
                const msg = JSON.parse(ev.data as string);
                if (msg.type === "status") {
                    setAgentUp(msg.agent === "connected");
                    setViewers(msg.viewers ?? 0);
                } else if (msg.type === "notice") {
                    termRef.current?.write(msg.text);
                }
            } catch {
                termRef.current?.write(String(ev.data));
            }
        };

        ws.onerror = () => setError("The relay socket failed. Check that the server is reachable over wss.");
        ws.onclose = ev => {
            wsRef.current = null;
            setAgentUp(false);
            setPhase(ev.code === 1000 ? "closed" : "error");
            if (ev.code === 4401 || ev.code === 1006) {
                setError(prev => prev ?? "The relay refused the connection — the ticket may have expired.");
            }
        };
    }, []);

    /* ── Build the terminal once ─────────────────────────────── */
    useEffect(() => {
        let disposed = false;

        (async () => {
            const [{ Terminal }, { FitAddon }] = await Promise.all([
                import("@xterm/xterm"),
                import("@xterm/addon-fit"),
            ]);
            await import("@xterm/xterm/css/xterm.css");
            if (disposed || !hostRef.current) return;

            const term = new Terminal({
                fontFamily: t.fontMono,
                fontSize: isMobile ? 11 : 13,
                cursorBlink: true,
                convertEol: false,
                theme: {
                    background: t.bgCard,
                    foreground: t.textPrimary,
                    cursor: t.accentPrimary,
                    selectionBackground: t.accentPrimaryMuted,
                },
            });
            const fit = new FitAddon();
            term.loadAddon(fit);
            term.open(hostRef.current);
            fit.fit();

            // Keystrokes go out as bytes; the agent writes them into the pty.
            term.onData(data => {
                const ws = wsRef.current;
                if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(new TextEncoder().encode(data));
                }
            });

            termRef.current = term as unknown as typeof termRef.current;
            fitRef.current = fit as unknown as typeof fitRef.current;

            const onResize = () => {
                fit.fit();
                const ws = wsRef.current;
                if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
                }
            };
            window.addEventListener("resize", onResize);

            term.write(
                "\x1b[90mNot attached. Press Attach to connect to the relay agent.\x1b[0m\r\n",
            );

            return () => window.removeEventListener("resize", onResize);
        })();

        return () => {
            disposed = true;
            wsRef.current?.close();
            termRef.current?.dispose();
            termRef.current = null;
        };
        // Rebuilding on every theme tick would drop the session, so the
        // terminal is created once and its colours are set at that moment.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const chip: React.CSSProperties = {
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.03em",
        padding: "3px 10px", borderRadius: 20,
    };

    const busy = phase === "connecting" || phase === "attached";

    return (
        <div style={{ padding: isMobile ? "20px 14px" : "32px 36px", minHeight: "100vh", background: t.bgPrimary, fontFamily: t.fontFamily }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: t.cardRadius,
                        background: t.accentPrimaryMuted,
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <TerminalIcon style={{ width: 22, height: 22, color: t.accentPrimary }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Claude Code Relay</h1>
                        <p style={{ fontSize: "0.83rem", color: t.textMuted, maxWidth: 640, lineHeight: 1.5 }}>
                            A remote screen onto Claude Code running on your own VM, under your own
                            subscription. Nothing runs here — this is a terminal, like SSH.
                        </p>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ ...chip, background: agentUp ? t.statusSuccessBg : t.bgTertiary, color: agentUp ? t.statusSuccess : t.textMuted }}>
                        <span style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: agentUp ? t.statusSuccess : t.textMuted,
                        }} />
                        {agentUp ? "Agent online" : "Agent offline"}
                    </span>
                    {viewers > 1 && (
                        <span style={{ ...chip, background: t.bgTertiary, color: t.textSecondary }}>
                            <Users style={{ width: 11, height: 11 }} />
                            {viewers} watching
                        </span>
                    )}
                    <button
                        onClick={() => (busy ? disconnect() : void connect())}
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 7,
                            padding: "9px 16px", borderRadius: t.buttonRadius, border: "none",
                            background: busy ? t.statusErrorBg : t.accentPrimary,
                            color: busy ? t.statusError : t.textInverse,
                            fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
                            fontFamily: t.fontFamily,
                        }}
                    >
                        {busy ? <PlugZap style={{ width: 15, height: 15 }} /> : <Plug style={{ width: 15, height: 15 }} />}
                        {phase === "connecting" ? "Attaching…" : busy ? "Detach" : "Attach"}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "12px 15px", marginBottom: 16,
                    borderRadius: t.cardRadius,
                    border: `1px solid ${t.statusError}40`,
                    background: t.statusErrorBg, color: t.statusError, fontSize: "0.83rem", lineHeight: 1.5,
                }}>
                    <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
                    <span style={{ flex: 1 }}>{error}</span>
                    <button
                        onClick={() => void connect()}
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
                            padding: "3px 9px", borderRadius: t.buttonRadius,
                            border: `1px solid ${t.statusError}55`,
                            background: "transparent", color: t.statusError,
                            fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", fontFamily: t.fontFamily,
                        }}
                    >
                        <RotateCcw style={{ width: 11, height: 11 }} /> Retry
                    </button>
                </div>
            )}

            {!agentUp && phase === "attached" && (
                <div style={{
                    padding: "12px 15px", marginBottom: 16,
                    borderRadius: t.cardRadius,
                    border: `1px solid ${t.borderPrimary}`,
                    background: t.bgTertiary, color: t.textSecondary,
                    fontSize: "0.82rem", lineHeight: 1.55,
                }}>
                    Attached to the relay, but no agent is connected. Start it on the VM:
                    <code style={{
                        display: "block", marginTop: 8, padding: "8px 10px",
                        borderRadius: t.buttonRadius, background: t.bgCard,
                        fontFamily: t.fontMono, fontSize: "0.78rem", color: t.textPrimary,
                        overflowX: "auto", whiteSpace: "pre",
                    }}>
{`cd relay/agent && npm install
RELAY_URL=wss://${typeof window !== "undefined" ? window.location.host : "your-host"}/api/relay/agent \\
RELAY_AGENT_TOKEN=… node claude-relay.mjs`}
                    </code>
                </div>
            )}

            <div style={{
                borderRadius: t.cardRadius,
                border: `1px solid ${t.borderPrimary}`,
                background: t.bgCard,
                padding: 10,
                boxShadow: t.shadow,
            }}>
                <div ref={hostRef} style={{ height: isMobile ? "60vh" : "68vh", width: "100%" }} />
            </div>

            <p style={{ marginTop: 12, fontSize: "0.75rem", color: t.textMuted, lineHeight: 1.6, maxWidth: 760 }}>
                Admin only, and it should stay that way — this is your own Claude Code session, so
                keep it to you rather than putting it in front of tenants. Every attach is written
                to the audit log. Setup lives in <code style={{ fontFamily: t.fontMono }}>relay/README.md</code>.
            </p>
        </div>
    );
}
