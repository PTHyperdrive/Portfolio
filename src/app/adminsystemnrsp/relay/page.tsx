"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as TerminalIcon, Plug, PlugZap, AlertTriangle, RotateCcw, Users, Monitor } from "lucide-react";
import RelaySetup from "./RelaySetup";
import AgentKeys from "./AgentKeys";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useIsMobile } from "@/lib/useIsMobile";

type Phase = "idle" | "connecting" | "attached" | "closed" | "error";

/** One machine running an agent, as the hub reports it. */
interface AgentInfo {
    id: string;
    name: string;
    viewers: number;
    meta?: {
        platform?: string;
        command?: string;
        commandFound?: boolean;
        commandVersion?: string | null;
        resolvedPath?: string | null;
        cwd?: string;
        terminal?: string;
        resizable?: boolean;
        node?: string;
    };
}

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
    const termRef = useRef<{
        dispose: () => void;
        write: (d: string | Uint8Array) => void;
        cols: number;
        rows: number;
    } | null>(null);
    const fitRef = useRef<{ fit: () => void } | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    /** Which agent this console is watching. A ref so the socket handler
     *  reads it without a stale closure. */
    const attachedRef = useRef<string | null>(null);

    const [phase, setPhase] = useState<Phase>("idle");
    const [agents, setAgents] = useState<AgentInfo[]>([]);
    const [attached, setAttached] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [host, setHost] = useState("");

    useEffect(() => { setHost(window.location.host); }, []);

    const disconnect = useCallback(() => {
        wsRef.current?.close(1000, "closed by operator");
        wsRef.current = null;
        attachedRef.current = null;
        setAttached(null);
        setPhase("closed");
    }, []);

    /**
     * Measure the terminal and tell the agent.
     *
     * Claude Code lays its whole UI out against the terminal width it is told
     * about. If that is wrong the box borders wrap and the screen looks
     * shredded — which is exactly what happened, because the only resize was
     * sent on socket open, before this console had attached to any agent, and
     * the hub drops control frames from a viewer that is not watching anything.
     */
    const syncSize = useCallback(() => {
        const ws = wsRef.current;
        const term = termRef.current;
        if (!term || ws?.readyState !== WebSocket.OPEN) return;
        fitRef.current?.fit();
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    }, []);

    /** Point this console at one machine. Switching is just another attach. */
    const attach = useCallback((id: string) => {
        const ws = wsRef.current;
        if (ws?.readyState !== WebSocket.OPEN) return;
        termRef.current?.write("\u001b[2J\u001b[H");
        ws.send(JSON.stringify({ type: "attach", id }));
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
            // No size is sent here on purpose: nothing is attached yet, so the
            // hub has no agent to forward it to. It goes out on "attached".
            setPhase("attached");
        };

        ws.onmessage = ev => {
            if (ev.data instanceof ArrayBuffer) {
                termRef.current?.write(new Uint8Array(ev.data));
                return;
            }
            try {
                const msg = JSON.parse(ev.data as string);
                if (msg.type === "agents") {
                    setAgents(msg.agents ?? []);
                    // Attach to the only machine automatically; with several,
                    // let the operator choose rather than guessing for them.
                    if (!attachedRef.current && msg.agents?.length === 1) {
                        attach(msg.agents[0].id);
                    }
                } else if (msg.type === "attached") {
                    attachedRef.current = msg.id;
                    setAttached(msg.id);
                    // Now there is an agent to receive it. Deferred a tick so
                    // the layout has settled — the setup panel disappears at
                    // this point, which changes the terminal's height.
                    setTimeout(syncSize, 60);
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
            setAgents([]);
            attachedRef.current = null;
            setAttached(null);
            setPhase(ev.code === 1000 ? "closed" : "error");
            // 4401 is the server actually rejecting us. 1006 is an abnormal
            // close with no close frame, which usually means the connection was
            // cut rather than refused — blaming the ticket for that sent the
            // last debugging session in the wrong direction entirely.
            if (ev.code === 4401) {
                setError(prev => prev ?? "The relay refused this ticket. Press Attach to get a new one.");
            } else if (ev.code !== 1000) {
                setError(prev => prev ?? `The relay connection dropped (code ${ev.code}). Press Attach to reconnect.`);
            }
        };
    }, [attach, syncSize]);

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

            // A ResizeObserver rather than window.resize: the terminal's box
            // changes height whenever the setup panel or an error banner
            // appears, and none of those are window resizes.
            const observer = new ResizeObserver(() => {
                fit.fit();
                const ws = wsRef.current;
                if (ws?.readyState === WebSocket.OPEN && termRef.current) {
                    ws.send(JSON.stringify({
                        type: "resize",
                        cols: termRef.current.cols,
                        rows: termRef.current.rows,
                    }));
                }
            });
            if (hostRef.current) observer.observe(hostRef.current);

            term.write(
                "\x1b[90mNot attached. Press Attach to connect to the relay agent.\x1b[0m\r\n",
            );

            return () => observer.disconnect();
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
                    <span style={{
                        ...chip,
                        background: agents.length ? t.statusSuccessBg : t.bgTertiary,
                        color: agents.length ? t.statusSuccess : t.textMuted,
                    }}>
                        <span style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: agents.length ? t.statusSuccess : t.textMuted,
                        }} />
                        {agents.length
                            ? `${agents.length} machine${agents.length > 1 ? "s" : ""} online`
                            : "No agent connected"}
                    </span>
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

            {/* Machine picker. Only worth showing once there is a choice. */}
            {phase === "attached" && agents.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                    {agents.map(a => {
                        const active = attached === a.id;
                        const broken = a.meta?.commandFound === false;
                        return (
                            <button
                                key={a.id}
                                onClick={() => attach(a.id)}
                                title={[
                                    a.meta?.platform,
                                    a.meta?.commandVersion || a.meta?.command,
                                    a.meta?.cwd,
                                    a.meta?.terminal && `terminal: ${a.meta.terminal}${a.meta.resizable ? "" : " (fixed 80x24)"}`,
                                ].filter(Boolean).join(" · ")}
                                style={{
                                    display: "inline-flex", alignItems: "center", gap: 8,
                                    padding: "8px 13px", borderRadius: t.buttonRadius,
                                    border: `1px solid ${active ? t.accentPrimary : t.borderPrimary}`,
                                    background: active ? t.accentPrimaryMuted : t.bgCard,
                                    color: active ? t.accentPrimary : t.textSecondary,
                                    fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                                    fontFamily: t.fontFamily,
                                }}
                            >
                                <Monitor style={{ width: 13, height: 13, flexShrink: 0 }} />
                                {a.name}
                                {broken && (
                                    <span style={{
                                        fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.04em",
                                        padding: "1px 6px", borderRadius: 20,
                                        background: t.statusErrorBg, color: t.statusError,
                                    }}>
                                        NO CLAUDE
                                    </span>
                                )}
                                {a.viewers > 1 && (
                                    <span style={{
                                        display: "inline-flex", alignItems: "center", gap: 3,
                                        fontSize: "0.66rem", color: t.textMuted,
                                    }}>
                                        <Users style={{ width: 10, height: 10 }} />{a.viewers}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Environment trouble on the attached machine, said plainly. */}
            {(() => {
                const current = agents.find(a => a.id === attached);
                if (!current || current.meta?.commandFound !== false) return null;
                return (
                    <div style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "12px 15px", marginBottom: 14,
                        borderRadius: t.cardRadius,
                        border: `1px solid ${t.statusError}40`,
                        background: t.statusErrorBg, color: t.textSecondary,
                        fontSize: "0.82rem", lineHeight: 1.55,
                    }}>
                        <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2, color: t.statusError }} />
                        <span>
                            <strong style={{ color: t.statusError }}>
                                &ldquo;{current.meta?.command}&rdquo; is not on PATH on {current.name}
                            </strong>{" "}
                            ({current.meta?.platform}). A service or non-login shell has a narrower
                            PATH than your terminal. Set{" "}
                            <code style={{ fontFamily: t.fontMono }}>RELAY_COMMAND</code> to the full
                            path and restart the agent, or set{" "}
                            <code style={{ fontFamily: t.fontMono }}>RELAY_SHELL=1</code> for a plain
                            shell to go find it.
                        </span>
                    </div>
                );
            })()}

            {/* The guide and credential list stay visible until a machine is
                actually attached, which is when they stop being what you need. */}
            {!(phase === "attached" && agents.length > 0) && (
                <>
                    <AgentKeys host={host} />
                    <RelaySetup host={host} />
                </>
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
