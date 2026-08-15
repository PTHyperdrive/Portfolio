#!/usr/bin/env node
/**
 * Claude Code relay agent
 *
 * Runs on the operator's own Linux VM, next to Claude Code. It wraps `claude`
 * in a pseudo-terminal and dials *out* to the platform over a WebSocket, so an
 * admin can drive that terminal from the browser.
 *
 * What this is: a remote screen onto a Claude Code session running in the
 * operator's own environment, under their own subscription, driven by them.
 * The same shape as SSH or tmux over the network.
 *
 * What this deliberately is not: a way for anyone else to use that session. The
 * server only accepts console sockets from an authenticated administrator, and
 * nothing about this exposes Claude Code to the platform's tenants. Keep it
 * that way — the moment other people's requests reach this pty, it stops being
 * you using your own tools.
 *
 * No credential travels over the wire. Claude Code authenticates on this VM,
 * exactly as it would if you were sitting at it.
 *
 * ── Running it ─────────────────────────────────────────────────────
 *
 *   npm install
 *   RELAY_URL=wss://www.notrespond.com/api/relay/agent \
 *   RELAY_AGENT_TOKEN=<same value as the server> \
 *   node claude-relay.mjs
 *
 * Optional:
 *   RELAY_COMMAND   what to run in the pty (default: claude)
 *   RELAY_CWD       working directory (default: $HOME)
 *   RELAY_SHELL     set to 1 to drop to a shell instead of Claude Code
 */

import { WebSocket } from "ws";
import { spawn } from "node:child_process";
import process from "node:process";

const RELAY_URL = process.env.RELAY_URL;
const TOKEN = process.env.RELAY_AGENT_TOKEN;
const COMMAND = process.env.RELAY_COMMAND || (process.env.RELAY_SHELL === "1" ? "bash" : "claude");
const CWD = process.env.RELAY_CWD || process.env.HOME || "/";

if (!RELAY_URL || !TOKEN) {
    console.error("RELAY_URL and RELAY_AGENT_TOKEN must both be set.");
    process.exit(1);
}

/**
 * Open a pty.
 *
 * node-pty is used when present — it gives proper terminal semantics including
 * window size, which Claude Code's UI depends on. It is a native module, so it
 * is optional: without it we fall back to `script`, which is on every Linux
 * box and allocates a real pty too. The fallback cannot be resized, so the
 * terminal is pinned to 80x24 there and the UI says so.
 */
async function openTerminal() {
    try {
        const { spawn: ptySpawn } = await import("node-pty");
        const term = ptySpawn(COMMAND, [], {
            name: "xterm-256color",
            cols: 120,
            rows: 30,
            cwd: CWD,
            env: { ...process.env, TERM: "xterm-256color" },
        });
        return {
            kind: "node-pty",
            resizable: true,
            write: d => term.write(d.toString("utf8")),
            resize: (cols, rows) => term.resize(cols, rows),
            onData: fn => term.onData(d => fn(Buffer.from(d, "utf8"))),
            onExit: fn => term.onExit(({ exitCode }) => fn(exitCode)),
            kill: () => term.kill(),
        };
    } catch {
        // `script -qfec CMD /dev/null` runs CMD under a pty and streams it.
        const child = spawn("script", ["-qfec", COMMAND, "/dev/null"], {
            cwd: CWD,
            env: { ...process.env, TERM: "xterm-256color", COLUMNS: "80", LINES: "24" },
            stdio: ["pipe", "pipe", "pipe"],
        });
        return {
            kind: "script",
            resizable: false,
            write: d => child.stdin.write(d),
            resize: () => { /* not supported under script(1) */ },
            onData: fn => {
                child.stdout.on("data", fn);
                child.stderr.on("data", fn);
            },
            onExit: fn => child.on("exit", code => fn(code ?? 0)),
            kill: () => child.kill(),
        };
    }
}

let backoff = 1000;

async function connect() {
    const term = await openTerminal();
    console.log(`[agent] terminal ready via ${term.kind} (resize ${term.resizable ? "supported" : "unavailable"})`);

    const ws = new WebSocket(RELAY_URL, { headers: { Authorization: `Bearer ${TOKEN}` } });

    ws.on("open", () => {
        backoff = 1000;
        console.log(`[agent] connected to ${RELAY_URL}`);
        ws.send(JSON.stringify({
            type: "notice",
            text: `Relay attached — ${COMMAND} in ${CWD} (${term.kind}` +
                `${term.resizable ? "" : ", fixed 80x24"}).\r\n`,
        }));
    });

    // pty → server
    term.onData(chunk => {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk, { binary: true });
    });

    term.onExit(code => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "notice", text: `\r\n[${COMMAND} exited with code ${code}]\r\n` }));
            ws.close(1000, "terminal exited");
        }
        console.log(`[agent] ${COMMAND} exited (${code}); restarting`);
    });

    // server → pty
    ws.on("message", (data, isBinary) => {
        if (isBinary) {
            term.write(data);
            return;
        }
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
        console.log(`[agent] ${reason}; reconnecting in ${backoff / 1000}s`);
        try { term.kill(); } catch { /* already gone */ }
        setTimeout(connect, backoff);
        // Back off to a minute, so a server outage does not become a hot loop.
        backoff = Math.min(backoff * 2, 60_000);
    };

    ws.on("close", (code, reason) => restart(`socket closed (${code} ${reason || ""})`.trim()));
    ws.on("error", err => {
        console.error(`[agent] socket error: ${err.message}`);
        // 'close' always follows 'error', so let that schedule the retry.
    });
}

process.on("SIGINT", () => { console.log("\n[agent] stopping"); process.exit(0); });

connect().catch(err => {
    console.error(`[agent] fatal: ${err.message}`);
    process.exit(1);
});
