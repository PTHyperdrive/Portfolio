#!/usr/bin/env node
/**
 * Claude Code relay agent
 *
 * Runs wherever Claude Code lives — a Linux VM, a Windows workstation, a Mac —
 * wraps `claude` in a terminal and dials *out* to the platform, so an admin can
 * drive that session from a browser.
 *
 * What this is: a remote screen onto a Claude Code session running in the
 * operator's own environment, under their own subscription, driven by them.
 * The same shape as SSH or tmux over the network. No credential travels: Claude
 * Code authenticates on this machine exactly as if you were sitting at it.
 *
 * What this deliberately is not: a way for anyone else to use that session. The
 * server only accepts console sockets from an authenticated administrator.
 * Keep it that way — the moment other people's requests reach this terminal it
 * stops being you using your own tools.
 *
 * ── Several machines at once ───────────────────────────────────────
 *
 * Each agent announces a name (RELAY_AGENT_NAME, defaulting to the hostname)
 * and the browser picks between them. Run one on every machine you want to
 * reach; they do not conflict. Reconnecting under the same name replaces the
 * old entry rather than adding a ghost.
 *
 * ── When the environment is wrong ──────────────────────────────────
 *
 * The usual failure is `claude` not being on PATH for a non-login shell, which
 * would otherwise show up as a terminal that opens and instantly dies. So the
 * agent checks before connecting, reports what it found, and — if the command
 * is missing — still connects and says so in the browser rather than leaving
 * you guessing from the other end.
 */

import { WebSocket } from "ws";
import { spawn, spawnSync } from "node:child_process";
import { hostname, platform, release } from "node:os";
import { existsSync } from "node:fs";
import process from "node:process";

const RELAY_URL = process.env.RELAY_URL;
const TOKEN = process.env.RELAY_AGENT_TOKEN;
const NAME = (process.env.RELAY_AGENT_NAME || hostname() || "agent").slice(0, 60);
const IS_WINDOWS = platform() === "win32";
const WANT_SHELL = process.env.RELAY_SHELL === "1";

const DEFAULT_SHELL = IS_WINDOWS ? "powershell.exe" : "bash";
const COMMAND = process.env.RELAY_COMMAND || (WANT_SHELL ? DEFAULT_SHELL : "claude");
const CWD = process.env.RELAY_CWD || process.env.HOME || process.env.USERPROFILE || process.cwd();

if (!RELAY_URL || !TOKEN) {
    console.error("RELAY_URL and RELAY_AGENT_TOKEN must both be set.");
    console.error("");
    console.error("  Linux/macOS:  RELAY_URL=wss://host/api/relay/agent RELAY_AGENT_TOKEN=... node claude-relay.mjs");
    console.error("  Windows:      $env:RELAY_URL='wss://host/api/relay/agent'; $env:RELAY_AGENT_TOKEN='...'; node claude-relay.mjs");
    process.exit(1);
}

/* ─── Preflight ──────────────────────────────────────────────────── */

/** Locate an executable the way the shell would, on either platform. */
function resolveCommand(cmd) {
    if (cmd.includes("/") || cmd.includes("\\")) {
        return existsSync(cmd) ? cmd : null;
    }
    const probe = IS_WINDOWS
        ? spawnSync("where", [cmd], { encoding: "utf8", shell: true })
        : spawnSync("sh", ["-lc", `command -v ${JSON.stringify(cmd)}`], { encoding: "utf8" });
    const out = (probe.stdout || "").split(/\r?\n/).find(Boolean);
    return probe.status === 0 && out ? out.trim() : null;
}

function versionOf(bin) {
    try {
        const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 8000, shell: IS_WINDOWS });
        return (r.stdout || r.stderr || "").trim().split(/\r?\n/)[0] || null;
    } catch {
        return null;
    }
}

const resolved = resolveCommand(COMMAND);
const nodeMajor = Number(process.versions.node.split(".")[0]);

const preflight = {
    command: COMMAND,
    resolvedPath: resolved,
    commandFound: Boolean(resolved),
    commandVersion: resolved ? versionOf(resolved) : null,
    cwd: CWD,
    cwdExists: existsSync(CWD),
    node: process.versions.node,
    platform: `${platform()} ${release()}`,
};

console.log(`[agent] name        ${NAME}`);
console.log(`[agent] platform    ${preflight.platform}, node ${preflight.node}`);
console.log(`[agent] command     ${COMMAND} -> ${resolved ?? "NOT FOUND on PATH"}`);
if (preflight.commandVersion) console.log(`[agent] version     ${preflight.commandVersion}`);
console.log(`[agent] cwd         ${CWD}${preflight.cwdExists ? "" : "  (does not exist!)"}`);

if (nodeMajor < 20) {
    console.warn(`[agent] node ${process.versions.node} is older than 20; the ws client may not work.`);
}
if (!preflight.commandFound) {
    console.warn(
        `[agent] "${COMMAND}" is not on PATH for this process.\n` +
        `        A service or non-login shell often has a narrower PATH than your terminal.\n` +
        `        Fix by giving the full path:  RELAY_COMMAND=${IS_WINDOWS ? "C:\\\\Users\\\\you\\\\AppData\\\\Roaming\\\\npm\\\\claude.cmd" : "/usr/local/bin/claude"}\n` +
        `        Connecting anyway so the browser can tell you the same thing.`,
    );
}

/* ─── Terminal ───────────────────────────────────────────────────── */

/**
 * Open a terminal for the command.
 *
 * node-pty gives real terminal semantics on every platform, Windows included
 * (it uses ConPTY there), and Claude Code's UI depends on knowing its window
 * size. It is a native module, so it stays optional:
 *
 *   - on Unix, `script` is a fine fallback — it allocates a real pty, but
 *     cannot be resized, so the terminal is pinned at 80x24;
 *   - on Windows there is no equivalent, so the fallback is plain pipes. Line
 *     editing and colour will be poor. The browser is told which one is in use
 *     rather than leaving you to infer it from the mangling.
 */
async function openTerminal() {
    try {
        const { spawn: ptySpawn } = await import("node-pty");
        const term = ptySpawn(resolved || COMMAND, [], {
            name: "xterm-256color",
            cols: 120,
            rows: 30,
            cwd: preflight.cwdExists ? CWD : process.cwd(),
            env: { ...process.env, TERM: "xterm-256color" },
        });
        return {
            kind: "node-pty",
            resizable: true,
            write: d => term.write(d.toString("utf8")),
            resize: (cols, rows) => { try { term.resize(cols, rows); } catch { /* closed */ } },
            onData: fn => term.onData(d => fn(Buffer.from(d, "utf8"))),
            onExit: fn => term.onExit(({ exitCode }) => fn(exitCode)),
            kill: () => { try { term.kill(); } catch { /* already gone */ } },
        };
    } catch {
        const useScript = !IS_WINDOWS && resolveCommand("script");
        const child = useScript
            ? spawn("script", ["-qfec", COMMAND, "/dev/null"], {
                cwd: preflight.cwdExists ? CWD : process.cwd(),
                env: { ...process.env, TERM: "xterm-256color", COLUMNS: "80", LINES: "24" },
                stdio: ["pipe", "pipe", "pipe"],
            })
            : spawn(resolved || COMMAND, [], {
                cwd: preflight.cwdExists ? CWD : process.cwd(),
                env: { ...process.env, TERM: "dumb" },
                stdio: ["pipe", "pipe", "pipe"],
                shell: IS_WINDOWS,
            });

        return {
            kind: useScript ? "script" : "pipes",
            resizable: false,
            write: d => { try { child.stdin.write(d); } catch { /* closed */ } },
            resize: () => { /* unsupported */ },
            onData: fn => { child.stdout.on("data", fn); child.stderr.on("data", fn); },
            onExit: fn => child.on("exit", code => fn(code ?? 0)),
            kill: () => { try { child.kill(); } catch { /* already gone */ } },
        };
    }
}

/* ─── Connection ─────────────────────────────────────────────────── */

let backoff = 1000;
let stopping = false;

async function connect() {
    const term = preflight.commandFound ? await openTerminal() : null;
    const terminalKind = term ? term.kind : "none";

    if (term) {
        console.log(`[agent] terminal    ${term.kind}${term.resizable ? "" : " (fixed 80x24, no resize)"}`);
    }

    const ws = new WebSocket(RELAY_URL, { headers: { Authorization: `Bearer ${TOKEN}` } });

    ws.on("open", () => {
        backoff = 1000;
        console.log(`[agent] connected to ${RELAY_URL} as "${NAME}"`);

        // Announce before anything flows; the hub keys everything on this.
        ws.send(JSON.stringify({
            type: "hello",
            name: NAME,
            meta: { ...preflight, terminal: terminalKind, resizable: term?.resizable ?? false },
        }));

        if (!preflight.commandFound) {
            // Connect regardless, so the failure is visible where the operator
            // is looking rather than only in a log on the far machine.
            ws.send(JSON.stringify({
                type: "notice",
                text:
                    `\r\n\x1b[31m"${COMMAND}" was not found on PATH on ${NAME}.\x1b[0m\r\n` +
                    `Platform: ${preflight.platform}\r\n` +
                    `A service or non-login shell often has a narrower PATH than your terminal.\r\n` +
                    `Set RELAY_COMMAND to the full path and restart the agent.\r\n`,
            }));
            return;
        }

        ws.send(JSON.stringify({
            type: "notice",
            text: `\r\n\x1b[32mAttached to ${NAME}\x1b[0m — ${COMMAND} in ${CWD} (${terminalKind}` +
                `${term?.resizable ? "" : ", fixed 80x24"}).\r\n`,
        }));
    });

    term?.onData(chunk => {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk, { binary: true });
    });

    term?.onExit(code => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "notice", text: `\r\n[${COMMAND} exited with code ${code}]\r\n` }));
            ws.close(1000, "terminal exited");
        }
        console.log(`[agent] ${COMMAND} exited (${code}); restarting`);
    });

    ws.on("message", (data, isBinary) => {
        if (!term) return;
        if (isBinary) { term.write(data); return; }
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "resize" && Number.isInteger(msg.cols) && Number.isInteger(msg.rows)) {
                term.resize(Math.max(20, msg.cols), Math.max(5, msg.rows));
            }
        } catch {
            // Not control JSON — ignore rather than injecting it as keystrokes.
        }
    });

    const restart = reason => {
        if (stopping) return;
        console.log(`[agent] ${reason}; reconnecting in ${backoff / 1000}s`);
        term?.kill();
        setTimeout(connect, backoff);
        // Back off to a minute, so a server outage is not a hot loop.
        backoff = Math.min(backoff * 2, 60_000);
    };

    ws.on("close", (code, reason) => restart(`socket closed (${code} ${reason || ""})`.trim()));
    ws.on("error", err => console.error(`[agent] socket error: ${err.message}`));
}

process.on("SIGINT", () => { stopping = true; console.log("\n[agent] stopping"); process.exit(0); });

connect().catch(err => {
    console.error(`[agent] fatal: ${err.message}`);
    process.exit(1);
});
