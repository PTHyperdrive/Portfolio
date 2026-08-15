/**
 * Relay hub — pairs one Claude Code agent with the admin browsers watching it
 *
 * The agent runs on the operator's own Linux VM, wraps `claude` in a pty, and
 * dials *out* to this server. Nothing listens on the VM and no inbound firewall
 * hole is needed: the VM initiates, which is what makes this safe to run behind
 * NAT or WireGuard.
 *
 * Shape of the thing:
 *
 *     browser ──ws──▶ /api/relay/console ─┐
 *     browser ──ws──▶ /api/relay/console ─┼─▶ hub ──ws──▶ /api/relay/agent ──▶ pty ──▶ claude
 *                                          ┘
 *
 * Several browsers may attach at once and they see the same session, which is
 * the point — it is one terminal viewed from more than one screen, not one
 * session per viewer. Output fans out to every viewer; input from any viewer
 * goes to the single agent.
 *
 * Frames are split by type rather than wrapped in an envelope: binary frames
 * are raw pty bytes in both directions, text frames are JSON control messages.
 * That keeps the hot path free of base64 and JSON parsing.
 */

/** The single connected agent, or null when the VM is not running one. */
let agent = null;

/** Browsers currently attached. */
const viewers = new Set();

/**
 * Recent pty output, replayed to a browser the moment it attaches.
 *
 * Without this you attach to a live session and see a blank screen until the
 * next keystroke produces output — the terminal looks broken. Capped so a long
 * running build cannot grow this without bound.
 */
const SCROLLBACK_LIMIT = 64 * 1024;
let scrollback = Buffer.alloc(0);

function remember(chunk) {
    scrollback = Buffer.concat([scrollback, chunk]);
    if (scrollback.length > SCROLLBACK_LIMIT) {
        scrollback = scrollback.subarray(scrollback.length - SCROLLBACK_LIMIT);
    }
}

function announce() {
    const status = JSON.stringify({
        type: "status",
        agent: agent ? "connected" : "disconnected",
        viewers: viewers.size,
    });
    for (const v of viewers) {
        if (v.readyState === 1) v.send(status);
    }
}

/** Attach the agent socket. A second agent is refused rather than swapped in. */
export function registerAgent(ws, { onLog } = {}) {
    if (agent && agent.readyState === 1) {
        ws.close(4409, "An agent is already connected");
        return false;
    }

    agent = ws;
    scrollback = Buffer.alloc(0);
    onLog?.("agent connected");
    announce();

    ws.on("message", (data, isBinary) => {
        if (isBinary) {
            remember(data);
            for (const v of viewers) {
                if (v.readyState === 1) v.send(data, { binary: true });
            }
            return;
        }
        // Control messages from the agent (exit notices, banner text).
        const text = data.toString();
        for (const v of viewers) {
            if (v.readyState === 1) v.send(text);
        }
    });

    const drop = () => {
        if (agent === ws) {
            agent = null;
            onLog?.("agent disconnected");
            announce();
        }
    };
    ws.on("close", drop);
    ws.on("error", drop);

    return true;
}

/** Attach a browser. Returns a detach function. */
export function registerViewer(ws) {
    viewers.add(ws);

    // Tell the new viewer where things stand, then replay what it missed.
    ws.send(JSON.stringify({
        type: "status",
        agent: agent ? "connected" : "disconnected",
        viewers: viewers.size,
    }));
    if (scrollback.length) ws.send(scrollback, { binary: true });

    ws.on("message", (data, isBinary) => {
        if (!agent || agent.readyState !== 1) {
            if (!isBinary) return;
            ws.send(JSON.stringify({
                type: "notice",
                text: "No agent is connected — start the relay agent on the VM.",
            }));
            return;
        }
        // Keystrokes and resize requests both go straight through; the agent
        // decides what to do with each.
        agent.send(data, { binary: isBinary });
    });

    const drop = () => {
        viewers.delete(ws);
        announce();
    };
    ws.on("close", drop);
    ws.on("error", drop);

    announce();
    return drop;
}

export function hubStatus() {
    return { agentConnected: Boolean(agent && agent.readyState === 1), viewers: viewers.size };
}
