/**
 * Relay hub — many machines, many viewers
 *
 * Agents run wherever Claude Code lives (a Linux VM, a Windows workstation, a
 * Mac) and dial *out* to this server. Nothing listens on those machines and no
 * inbound firewall rule is needed, which is what makes this workable behind
 * NAT or WireGuard.
 *
 *     browser ──ws──▶ /api/relay/console ──┐            ┌── agent "vm-dev"    ──▶ pty ──▶ claude
 *     browser ──ws──▶ /api/relay/console ──┼── hub ─────┼── agent "workstation" ─▶ pty ──▶ claude
 *                                          ┘            └── agent "mac-mini"   ──▶ pty ──▶ claude
 *
 * A viewer attaches to one agent at a time and may switch. Several viewers on
 * the same agent share one terminal — that is deliberate: it is one session
 * seen from more than one screen, not a session each.
 *
 * Frames are split by type rather than wrapped: binary frames are raw pty
 * bytes, text frames are JSON control. That keeps the hot path free of base64.
 */

/** Connected agents, keyed by the name they announce. */
const agents = new Map();

/** Viewer sockets → the agent id they are watching (or null). */
const viewers = new Map();

/** Per-agent scrollback, so attaching does not show a blank screen. */
const SCROLLBACK_LIMIT = 64 * 1024;

function agentList() {
    return [...agents.entries()].map(([id, a]) => ({
        id,
        name: a.name,
        meta: a.meta,
        connectedAt: a.connectedAt,
        viewers: [...viewers.values()].filter(v => v === id).length,
    }));
}

function broadcastRoster() {
    const msg = JSON.stringify({ type: "agents", agents: agentList() });
    for (const ws of viewers.keys()) {
        if (ws.readyState === 1) ws.send(msg);
    }
}

function sendTo(agentId, data, binary) {
    for (const [ws, watching] of viewers) {
        if (watching === agentId && ws.readyState === 1) ws.send(data, { binary });
    }
}

/* ─── Agents ─────────────────────────────────────────────────────── */

/**
 * Attach an agent socket.
 *
 * The agent announces itself with a `hello` before anything flows, so the hub
 * knows which machine this is and what it found there. A reconnect under the
 * same name replaces the old entry rather than accumulating ghosts — a dropped
 * socket is not always noticed before the agent retries.
 */
export function registerAgent(ws, { onLog, expectedName } = {}) {
    let id = null;

    ws.on("message", (data, isBinary) => {
        if (isBinary) {
            if (!id) return; // nothing before hello
            const agent = agents.get(id);
            if (agent) {
                agent.scrollback = Buffer.concat([agent.scrollback, data]);
                if (agent.scrollback.length > SCROLLBACK_LIMIT) {
                    agent.scrollback = agent.scrollback.subarray(agent.scrollback.length - SCROLLBACK_LIMIT);
                }
            }
            sendTo(id, data, true);
            return;
        }

        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }

        if (msg.type === "hello") {
            // The name comes from the credential, not the announcement. A
            // machine authenticated as "vm-dev" cannot claim to be
            // "workstation" and start receiving its keystrokes.
            const claimed = String(msg.name || "unnamed").slice(0, 60);
            const name = expectedName || claimed;
            if (expectedName && claimed !== expectedName) {
                onLog?.(`agent authenticated as "${expectedName}" announced itself as "${claimed}" — using the credential`);
            }
            id = name;

            const existing = agents.get(id);
            const replacedLive = Boolean(existing && existing.ws !== ws && existing.ws.readyState === 1);

            if (replacedLive) {
                existing.ws.close(4409, "replaced by a newer connection");
                // Replacement is normal after a dropped socket, but it is also
                // what taking over a name looks like: every agent presents the
                // same shared token, so holding it is enough to claim any name
                // and start receiving what the operator types. Say so loudly
                // rather than swapping the machine out from under them.
                onLog?.(`WARNING: agent "${name}" replaced a still-connected agent`);
                sendTo(id, JSON.stringify({
                    type: "notice",
                    text: `\r\n\x1b[33m[${name} was replaced by a new connection while the previous one ` +
                        `was still live. Expected after a dropped link. If you did not restart it, ` +
                        `revoke this machine's credential in Admin → Claude Code Relay.]\x1b[0m\r\n`,
                }), false);
            }

            agents.set(id, {
                ws,
                name,
                meta: msg.meta || {},
                connectedAt: Date.now(),
                scrollback: Buffer.alloc(0),
            });
            onLog?.(`agent "${name}" connected (${msg.meta?.platform ?? "?"}, ${msg.meta?.terminal ?? "?"})`);
            broadcastRoster();
            return;
        }

        // Anything else the agent says (notices, exit codes) goes to watchers.
        if (id) sendTo(id, data.toString(), false);
    });

    const drop = () => {
        if (!id) return;
        const agent = agents.get(id);
        if (agent && agent.ws === ws) {
            agents.delete(id);
            onLog?.(`agent "${id}" disconnected`);
            // Tell anyone watching, so the UI does not look merely idle.
            sendTo(id, JSON.stringify({ type: "notice", text: `\r\n[${id} disconnected]\r\n` }), false);
            broadcastRoster();
        }
    };
    ws.on("close", drop);
    ws.on("error", drop);
}

/* ─── Viewers ────────────────────────────────────────────────────── */

export function registerViewer(ws) {
    viewers.set(ws, null);
    ws.send(JSON.stringify({ type: "agents", agents: agentList() }));

    ws.on("message", (data, isBinary) => {
        const watching = viewers.get(ws);

        if (isBinary) {
            const agent = watching && agents.get(watching);
            if (agent && agent.ws.readyState === 1) agent.ws.send(data, { binary: true });
            return;
        }

        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }

        if (msg.type === "reset") {
            // Viewers are admin-only, so no further check is needed here — the
            // ticket that opened this socket was already proof of that.
            const cleared = resetSessions({ keepViewer: ws });
            ws.send(JSON.stringify({ type: "reset-done", ...cleared }));
            ws.send(JSON.stringify({
                type: "notice",
                text: `\r\n\x1b[33m[sessions cleared: ${cleared.agentsClosed} machine(s), ` +
                    `${cleared.viewersClosed} other console(s). Agents reconnect on their own.]\x1b[0m\r\n`,
            }));
            return;
        }

        if (msg.type === "attach") {
            const id = String(msg.id || "");
            if (!agents.has(id)) {
                ws.send(JSON.stringify({ type: "notice", text: `No agent named "${id}" is connected.\r\n` }));
                return;
            }
            viewers.set(ws, id);
            ws.send(JSON.stringify({ type: "attached", id }));
            // Replay what this terminal already printed, or the screen is
            // blank until the next keystroke and looks broken.
            const back = agents.get(id).scrollback;
            if (back.length) ws.send(back, { binary: true });
            broadcastRoster();
            return;
        }

        // resize and anything else are for the agent to interpret.
        const agent = watching && agents.get(watching);
        if (agent && agent.ws.readyState === 1) agent.ws.send(data.toString(), { binary: false });
    });

    const drop = () => {
        viewers.delete(ws);
        broadcastRoster();
    };
    ws.on("close", drop);
    ws.on("error", drop);
}

/**
 * Drop every session and start clean.
 *
 * Agents reconnect on their own, which is the point: a terminal wedged behind
 * a half-dead socket, or scrollback from a session nobody wants replayed to
 * the next viewer, is cleared without anyone touching the machines. The
 * console that asked is kept so it can watch them come back.
 *
 * Scrollback goes too. It is the only place terminal output lingers on the
 * server, so clearing it is also how you get rid of whatever the last session
 * happened to print.
 */
export function resetSessions({ keepViewer } = {}) {
    let agentsClosed = 0;
    let viewersClosed = 0;

    for (const [id, agent] of agents) {
        agent.scrollback = Buffer.alloc(0);
        if (agent.ws.readyState === 1) {
            agent.ws.close(4000, "session cleared by an administrator");
            agentsClosed += 1;
        }
        agents.delete(id);
    }

    for (const ws of [...viewers.keys()]) {
        if (ws === keepViewer) {
            // Keep the requester attached to nothing, so the roster it gets
            // next reflects reality rather than a machine it can no longer see.
            viewers.set(ws, null);
            continue;
        }
        if (ws.readyState === 1) {
            ws.close(4000, "session cleared by an administrator");
            viewersClosed += 1;
        }
        viewers.delete(ws);
    }

    broadcastRoster();
    return { agentsClosed, viewersClosed };
}

export function hubStatus() {
    return { agents: agentList(), viewers: viewers.size };
}
