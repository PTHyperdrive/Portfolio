"use client";

import { useState } from "react";
import { Terminal, Copy, Check, AlertTriangle } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";

type Shell = "powershell" | "cmd" | "linux" | "macos";

const LABELS: Record<Shell, string> = {
    powershell: "Windows · PowerShell",
    cmd: "Windows · cmd.exe",
    linux: "Linux",
    macos: "macOS",
};

/**
 * Setup instructions for the relay agent.
 *
 * Two things this has to get right, both learned the hard way:
 *
 * 1. No repository. The first version opened with "cd relay/agent", which
 *    assumed the whole project was checked out on the machine you wanted to
 *    reach. On a fresh workstation that fails immediately and unhelpfully. The
 *    agent is now downloaded from the server, so a machine needs nothing but
 *    Node.
 *
 * 2. No comments inside the copyable block. A trailing `# note` is a comment in
 *    bash and PowerShell but *not* in cmd.exe, where it was handed to npm as a
 *    package name and produced EINVALIDTAGNAME. Explanations belong outside the
 *    block, where they cannot be pasted by accident.
 *
 * cmd.exe gets its own tab rather than a footnote, because `$env:VAR = "..."`
 * is PowerShell syntax and fails there with a message about volume labels that
 * tells you nothing about the real problem.
 */
export default function RelaySetup({ host }: { host: string }) {
    const t = useThemeTokens();
    const [shell, setShell] = useState<Shell>("powershell");
    const [copied, setCopied] = useState(false);

    const wsUrl = `wss://${host}/api/relay/agent`;
    const srcUrl = `https://${host}/api/relay/agent-source`;

    /**
     * There is no single token any more.
     *
     * Each machine has its own secret, issued in the Machines panel above, so
     * the snippet carries a placeholder and the operator pastes the one secret
     * that belongs to the box in front of them. Filling it in automatically
     * would mean guessing which machine this is for.
     */
    const TOKEN = "PASTE_THIS_MACHINES_SECRET";

    const snippets: Record<Shell, string> = {
        powershell: `mkdir claude-relay
cd claude-relay
npm init -y
npm install ws node-pty
Invoke-WebRequest -Uri "${srcUrl}" -Headers @{ Authorization = "Bearer ${TOKEN}" } -OutFile claude-relay.mjs
$env:RELAY_URL = "${wsUrl}"
$env:RELAY_AGENT_SECRET = "${TOKEN}"
$env:RELAY_AGENT_NAME = "workstation"
node claude-relay.mjs`,

        cmd: `mkdir claude-relay
cd claude-relay
npm init -y
npm install ws node-pty
curl -f -H "Authorization: Bearer ${TOKEN}" "${srcUrl}" -o claude-relay.mjs
set RELAY_URL=${wsUrl}
set RELAY_AGENT_SECRET=${TOKEN}
set RELAY_AGENT_NAME=workstation
node claude-relay.mjs`,

        linux: `mkdir -p ~/claude-relay && cd ~/claude-relay
npm init -y
npm install ws
curl -fsSL -H "Authorization: Bearer ${TOKEN}" "${srcUrl}" -o claude-relay.mjs
export RELAY_URL="${wsUrl}"
export RELAY_AGENT_SECRET="${TOKEN}"
export RELAY_AGENT_NAME="vm-dev"
node claude-relay.mjs`,

        macos: `mkdir -p ~/claude-relay && cd ~/claude-relay
npm init -y
npm install ws
curl -fsSL -H "Authorization: Bearer ${TOKEN}" "${srcUrl}" -o claude-relay.mjs
export RELAY_URL="${wsUrl}"
export RELAY_AGENT_SECRET="${TOKEN}"
export RELAY_AGENT_NAME="mac-mini"
node claude-relay.mjs`,
    };

    const ptyNote: Record<Shell, React.ReactNode> = {
        powershell: (
            <>
                <strong style={{ color: t.statusWarning }}>node-pty is required here, not optional.</strong>{" "}
                Windows has no <code>script(1)</code> to fall back on, and without a real terminal
                Claude Code sees a non-interactive pipe, switches to <code>--print</code> mode,
                finds no piped input and exits with &ldquo;Input must be provided either through
                stdin or as a prompt argument&rdquo;. Compiling it needs Visual Studio Build Tools
                (C++ workload). If that is not practical, run the agent under WSL or on a Linux
                machine instead.
            </>
        ),
        cmd: (
            <>
                <strong style={{ color: t.statusWarning }}>node-pty is required here, not optional.</strong>{" "}
                Windows has no <code>script(1)</code> fallback, and without a real terminal Claude
                Code exits immediately with &ldquo;Input must be provided either through stdin or
                as a prompt argument&rdquo;. Needs Visual Studio Build Tools (C++ workload);
                otherwise use WSL or a Linux machine.
            </>
        ),
        linux: (
            <>
                Optional: <code>npm install node-pty</code> adds resizing. Without it the agent uses{" "}
                <code>script(1)</code>, which is still a real terminal — so Claude Code runs — but
                fixed at 80×24. Building it needs <code>build-essential</code> and{" "}
                <code>python3</code>.
            </>
        ),
        macos: (
            <>
                Optional: <code>npm install node-pty</code> adds resizing. Without it the agent uses{" "}
                <code>script</code>, a real terminal fixed at 80×24, which Claude Code is happy
                with. Building it needs <code>xcode-select --install</code>.
            </>
        ),
    };

    const code: React.CSSProperties = {
        fontFamily: t.fontMono,
        fontSize: "0.82em",
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: 4,
        padding: "1px 5px",
    };

    return (
        <div style={{
            padding: "14px 16px",
            marginBottom: 16,
            borderRadius: t.cardRadius,
            border: `1px solid ${t.borderPrimary}`,
            background: t.bgTertiary,
            fontSize: "0.82rem",
            lineHeight: 1.6,
            color: t.textSecondary,
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <Terminal style={{ width: 15, height: 15, color: t.accentPrimary }} />
                <strong style={{ color: t.textPrimary, fontSize: "0.88rem" }}>
                    Start an agent on any machine that runs Claude Code
                </strong>
            </div>
            <p style={{ marginBottom: 12, color: t.textMuted }}>
                No checkout needed — the agent downloads itself. Node 20+ is the only prerequisite.{" "}
                Replace <code style={code}>PASTE_THIS_MACHINES_SECRET</code> with the secret for
                this machine, from the Machines panel above.
            </p>

            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {(Object.keys(LABELS) as Shell[]).map(k => (
                    <button
                        key={k}
                        onClick={() => setShell(k)}
                        style={{
                            padding: "5px 12px", borderRadius: t.buttonRadius,
                            border: `1px solid ${shell === k ? t.accentPrimary : t.borderPrimary}`,
                            background: shell === k ? t.accentPrimaryMuted : "transparent",
                            color: shell === k ? t.accentPrimary : t.textMuted,
                            fontSize: "0.74rem", fontWeight: 600, cursor: "pointer",
                            fontFamily: t.fontFamily,
                        }}
                    >
                        {LABELS[k]}
                    </button>
                ))}
            </div>

            <div style={{ position: "relative" }}>
                <pre style={{
                    margin: 0, padding: "12px 14px", overflowX: "auto",
                    borderRadius: t.buttonRadius,
                    background: t.isLight ? "#f6f8fa" : "#0d1117",
                    border: `1px solid ${t.borderPrimary}`,
                    fontFamily: t.fontMono, fontSize: "0.76rem", lineHeight: 1.7,
                    color: t.isLight ? t.textPrimary : "#e6edf3",
                }}>
                    <code>{snippets[shell]}</code>
                </pre>
                <button
                    onClick={() => {
                        void navigator.clipboard.writeText(snippets[shell]).then(() => {
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

            {(shell === "powershell" || shell === "cmd") && (
                <p style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    marginTop: 10, color: t.statusWarning,
                }}>
                    <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 3 }} />
                    <span>
                        These two shells are not interchangeable.{" "}
                        <code style={code}>$env:VAR = &quot;x&quot;</code> only works in PowerShell;{" "}
                        <code style={code}>set VAR=x</code> only works in cmd.exe. Using the wrong
                        one fails with &ldquo;The filename, directory name, or volume label syntax
                        is incorrect&rdquo;, which does not hint at the real cause. Check your prompt:
                        cmd.exe shows <code style={code}>C:\Users\you&gt;</code>, PowerShell shows{" "}
                        <code style={code}>PS C:\Users\you&gt;</code>.
                    </span>
                </p>
            )}

            <p style={{ marginTop: 10 }}>{ptyNote[shell]}</p>

            <p style={{
                marginTop: 10, display: "flex", alignItems: "flex-start", gap: 8,
                color: t.textMuted,
            }}>
                <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 3 }} />
                <span>
                    <strong style={{ color: t.textPrimary }}>
                        If node reports a syntax error on line 1:
                    </strong>{" "}
                    the download failed and the error was written into the file instead of the
                    agent. Open <code style={code}>claude-relay.mjs</code> — if it says{" "}
                    <code style={code}>{"{"}&quot;error&quot;:&quot;Unauthorized&quot;{"}"}</code>{" "}
                    the secret was wrong, revoked, or the placeholder was left unreplaced. The{" "}
                    <code style={code}>-f</code> on curl makes it fail loudly instead, but a file
                    from an earlier attempt will still be sitting there.
                </span>
            </p>

            <p style={{ marginTop: 10 }}>
                <strong style={{ color: t.textPrimary }}>Several machines:</strong> repeat this on
                each, giving every one a different <code style={code}>RELAY_AGENT_NAME</code>. They
                appear side by side above and you switch between them. Reconnecting under a name
                replaces that entry rather than adding a duplicate.
            </p>

            <p style={{
                marginTop: 10, display: "flex", alignItems: "flex-start", gap: 8,
                color: t.textMuted,
            }}>
                <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 3 }} />
                <span>
                    <strong style={{ color: t.textPrimary }}>
                        If <code style={code}>claude</code> is not found:
                    </strong>{" "}
                    a service or non-login shell has a narrower PATH than your terminal, which is
                    the usual cause. The agent connects anyway and reports it here rather than dying
                    quietly — set <code style={code}>RELAY_COMMAND</code> to the full path and
                    restart it. <code style={code}>RELAY_SHELL=1</code> gives a plain shell, which
                    is a quick way to go and find that path.
                </span>
            </p>

            <style>{`@keyframes relaySpin { to { transform: rotate(360deg) } }`}</style>
        </div>
    );
}
