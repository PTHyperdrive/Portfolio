"use client";

import { useState } from "react";
import { Terminal, Copy, Check, AlertTriangle } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";

type Os = "linux" | "windows" | "macos";

const LABELS: Record<Os, string> = {
    linux: "Linux",
    macos: "macOS",
    windows: "Windows",
};

/**
 * Setup instructions for the relay agent.
 *
 * Split by platform because the differences are not cosmetic: environment
 * variables are set differently in PowerShell, `script(1)` does not exist on
 * Windows so node-pty stops being optional there, and the path Claude Code
 * installs to differs on each.
 *
 * The token is never printed here. It sits in the server's .env, and echoing it
 * into a page — which ends up in screenshots and shoulder-surfing range — would
 * undo the reason it is a secret.
 */
export default function RelaySetup({ host }: { host: string }) {
    const t = useThemeTokens();
    const [os, setOs] = useState<Os>("linux");
    const [copied, setCopied] = useState(false);

    const url = `wss://${host}/api/relay/agent`;

    const snippets: Record<Os, string> = {
        linux: `cd relay/agent
npm install                    # node-pty is optional but gives resize support

export RELAY_URL=${url}
export RELAY_AGENT_TOKEN=<from the server's .env>
export RELAY_AGENT_NAME=vm-dev          # how this machine appears in the picker
node claude-relay.mjs`,
        macos: `cd relay/agent
npm install

export RELAY_URL=${url}
export RELAY_AGENT_TOKEN=<from the server's .env>
export RELAY_AGENT_NAME=mac-mini
node claude-relay.mjs`,
        windows: `cd relay\\agent
npm install                    # node-pty matters here: without it there is no real terminal

$env:RELAY_URL        = "${url}"
$env:RELAY_AGENT_TOKEN = "<from the server's .env>"
$env:RELAY_AGENT_NAME  = "workstation"
node claude-relay.mjs`,
    };

    const notes: Record<Os, React.ReactNode> = {
        linux: (
            <>
                <code style={{ fontFamily: t.fontMono }}>node-pty</code> needs{" "}
                <code style={{ fontFamily: t.fontMono }}>build-essential</code> and{" "}
                <code style={{ fontFamily: t.fontMono }}>python3</code>. Without it the agent falls
                back to <code style={{ fontFamily: t.fontMono }}>script(1)</code>, which is a real
                terminal but cannot be resized — it stays at 80×24 and the panel says so.
            </>
        ),
        macos: (
            <>
                <code style={{ fontFamily: t.fontMono }}>node-pty</code> needs Xcode command line
                tools (<code style={{ fontFamily: t.fontMono }}>xcode-select --install</code>).
                Without it the agent uses <code style={{ fontFamily: t.fontMono }}>script</code> at a
                fixed 80×24.
            </>
        ),
        windows: (
            <>
                There is no <code style={{ fontFamily: t.fontMono }}>script(1)</code> on Windows, so{" "}
                <code style={{ fontFamily: t.fontMono }}>node-pty</code> is what gives you a real
                terminal — it uses ConPTY. Without it the agent falls back to plain pipes: it works,
                but line editing and colour will be poor. Install the build tools with{" "}
                <code style={{ fontFamily: t.fontMono }}>npm i -g windows-build-tools</code> or
                Visual Studio Build Tools.
            </>
        ),
    };

    const box: React.CSSProperties = {
        padding: "12px 14px",
        borderRadius: t.cardRadius,
        border: `1px solid ${t.borderPrimary}`,
        background: t.bgTertiary,
        fontSize: "0.8rem",
        lineHeight: 1.6,
        color: t.textSecondary,
    };

    return (
        <div style={{ ...box, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <Terminal style={{ width: 15, height: 15, color: t.accentPrimary }} />
                <strong style={{ color: t.textPrimary, fontSize: "0.86rem" }}>
                    Start an agent on any machine that runs Claude Code
                </strong>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    {(Object.keys(LABELS) as Os[]).map(k => (
                        <button
                            key={k}
                            onClick={() => setOs(k)}
                            style={{
                                padding: "4px 11px", borderRadius: t.buttonRadius,
                                border: `1px solid ${os === k ? t.accentPrimary : t.borderPrimary}`,
                                background: os === k ? t.accentPrimaryMuted : "transparent",
                                color: os === k ? t.accentPrimary : t.textMuted,
                                fontSize: "0.74rem", fontWeight: 600, cursor: "pointer",
                                fontFamily: t.fontFamily,
                            }}
                        >
                            {LABELS[k]}
                        </button>
                    ))}
                </span>
            </div>

            <div style={{ position: "relative" }}>
                <pre style={{
                    margin: 0, padding: "12px 14px", overflowX: "auto",
                    borderRadius: t.buttonRadius,
                    background: t.isLight ? "#f6f8fa" : "#0d1117",
                    border: `1px solid ${t.borderPrimary}`,
                    fontFamily: t.fontMono, fontSize: "0.76rem", lineHeight: 1.65,
                    color: t.isLight ? t.textPrimary : "#e6edf3",
                }}>
                    <code>{snippets[os]}</code>
                </pre>
                <button
                    onClick={() => {
                        void navigator.clipboard.writeText(snippets[os]).then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                        });
                    }}
                    style={{
                        position: "absolute", top: 7, right: 8,
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 9px", borderRadius: t.buttonRadius,
                        border: `1px solid ${t.borderPrimary}`,
                        background: t.bgCard, color: t.textMuted,
                        fontSize: "0.68rem", fontWeight: 600, cursor: "pointer",
                        fontFamily: t.fontFamily,
                    }}
                >
                    {copied
                        ? <><Check style={{ width: 11, height: 11 }} /> Copied</>
                        : <><Copy style={{ width: 11, height: 11 }} /> Copy</>}
                </button>
            </div>

            <p style={{ marginTop: 10 }}>{notes[os]}</p>

            <p style={{ marginTop: 10 }}>
                <strong style={{ color: t.textPrimary }}>Several machines at once:</strong> run an
                agent on each, giving every one a distinct{" "}
                <code style={{ fontFamily: t.fontMono }}>RELAY_AGENT_NAME</code>. They appear
                together above and you switch between them. Reconnecting under a name replaces that
                entry rather than adding a duplicate.
            </p>

            <p style={{
                marginTop: 10, display: "flex", alignItems: "flex-start", gap: 8,
                color: t.textMuted,
            }}>
                <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 3 }} />
                <span>
                    <strong style={{ color: t.textPrimary }}>If <code style={{ fontFamily: t.fontMono }}>claude</code> is not found:</strong>{" "}
                    a service or non-login shell has a narrower PATH than your terminal, which is the
                    usual cause. The agent still connects and says so here rather than dying quietly
                    — set <code style={{ fontFamily: t.fontMono }}>RELAY_COMMAND</code> to the full
                    path and restart it. Set{" "}
                    <code style={{ fontFamily: t.fontMono }}>RELAY_SHELL=1</code> to get a plain
                    shell instead, which is a quick way to find out what that path is.
                </span>
            </p>
        </div>
    );
}
