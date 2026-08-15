#!/usr/bin/env node

/**
 * Custom Next.js Server with VNC WebSocket Proxy
 *
 * Next.js rewrites only proxy HTTP — not WebSocket upgrades.
 * This server intercepts upgrade requests on /novnc/ and tunnels
 * them to Proxmox VE at the raw TCP level (like Nginx proxy_pass).
 *
 * All other traffic (HTTP + HMR WebSocket) is handled by Next.js.
 */

import { createServer } from "node:http";
import { connect as tlsConnect } from "node:tls";
import { readFileSync } from "node:fs";
import next from "next";
import { WebSocketServer } from "ws";
import pkg from "@next/env";
import { verifyTicket, verifyAgentToken } from "./lib/relay-ticket.mjs";
import { registerAgent, registerViewer } from "./lib/relay-hub.mjs";
const { loadEnvConfig } = pkg;

// ── Environment ─────────────────────────────────────────────────
const dev = process.env.NODE_ENV !== "production";
loadEnvConfig(process.cwd(), dev);

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";

// ── TLS options (mirrors src/lib/proxmox.ts buildProxmoxTlsConnect) ──
function buildTlsOptions() {
    const insecure   = process.env.PROXMOX_VE_TLS_INSECURE === "true";
    const caPath     = process.env.PROXMOX_VE_CA_PATH;
    const servername = process.env.PROXMOX_VE_TLS_SERVERNAME;

    if (insecure) {
        console.warn("[vnc-proxy] ⚠ TLS verification disabled (PROXMOX_VE_TLS_INSECURE)");
        return { rejectUnauthorized: false };
    }

    const opts = { rejectUnauthorized: true };
    if (caPath) {
        try {
            opts.ca = readFileSync(caPath, "utf-8");
            console.log(`[vnc-proxy] ✔ Using CA: ${caPath}`);
        } catch (e) {
            throw new Error(`Cannot read PROXMOX_VE_CA_PATH: ${e.message}`);
        }
    }
    if (servername) opts.servername = servername;
    return opts;
}

// ── Next.js App ─────────────────────────────────────────────────
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const tlsOpts  = buildTlsOptions();
    const pveHost  = process.env.PROXMOX_VE_HOST;
    const pvePort  = parseInt(process.env.PROXMOX_VE_PORT || "8006", 10);

    const pveTokenId    = process.env.PROXMOX_VE_TOKEN_ID;
    const pveTokenValue = process.env.PROXMOX_VE_TOKEN_VALUE;

    if (!pveHost) {
        console.warn("[vnc-proxy] PROXMOX_VE_HOST not set — VNC proxy disabled");
    }

    const server = createServer(handle);

    // ── Claude Code relay ───────────────────────────────────────
    // Two endpoints on one hub: the agent on the operator's VM dials in on
    // /api/relay/agent, and admin browsers attach on /api/relay/console. Both
    // are authenticated here, before the socket is accepted — an unauthorised
    // upgrade is answered with a plain HTTP error and the socket destroyed,
    // rather than being upgraded and then closed, which would let an anonymous
    // caller confirm the endpoint exists.
    const relayWss = new WebSocketServer({ noServer: true });

    const denyUpgrade = (socket, code, reason) => {
        socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
    };

    function handleRelayUpgrade(req, socket, head, pathname, params) {
        if (pathname === "/api/relay/agent") {
            const header = req.headers.authorization || "";
            const token = header.startsWith("Bearer ") ? header.slice(7) : "";
            if (!verifyAgentToken(token)) {
                console.warn("[relay] ✘ agent rejected: bad or missing bearer token");
                return denyUpgrade(socket, 401, "Unauthorized");
            }
            relayWss.handleUpgrade(req, socket, head, ws => {
                const ok = registerAgent(ws, { onLog: m => console.log(`[relay] ${m}`) });
                if (!ok) console.warn("[relay] ✘ second agent refused");
            });
            return;
        }

        // Browser console. The ticket is minted by an admin-only API route, so
        // a valid signature is proof of an admin session without this server
        // needing to understand NextAuth at all.
        const userId = verifyTicket(params.get("ticket") || "");
        if (!userId) {
            console.warn("[relay] ✘ console rejected: invalid or expired ticket");
            return denyUpgrade(socket, 401, "Unauthorized");
        }
        relayWss.handleUpgrade(req, socket, head, ws => {
            console.log(`[relay] console attached (user ${userId})`);
            registerViewer(ws);
        });
    }

    // ── WebSocket upgrade handler ───────────────────────────────
    server.on("upgrade", (req, socket, head) => {
        const url = req.url || "";

        if (url.startsWith("/api/relay/")) {
            const parsed = new URL(url, "http://localhost");
            return handleRelayUpgrade(req, socket, head, parsed.pathname, parsed.searchParams);
        }

        // Only intercept /novnc/ paths; let Next.js handle HMR etc.
        if (!url.startsWith("/novnc/") || !pveHost) return;

        // Strip the /novnc prefix → forward to Proxmox VE
        const targetPath = url.replace(/^\/novnc/, "");

        // ── Security: only allow vncwebsocket endpoints ─────────
        // Without this, an attacker could proxy arbitrary Proxmox API
        // calls (e.g. /api2/json/.../status/stop) using our token.
        const pathname = targetPath.split("?")[0];
        if (!pathname.endsWith("/vncwebsocket")) {
            console.warn(`[vnc-proxy] ✘ Blocked non-VNC path: ${pathname}`);
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
        }

        console.log(`[vnc-proxy] Upgrading: ${targetPath.slice(0, 80)}…`);

        // Open a TLS connection to Proxmox
        const upstream = tlsConnect({
            host: pveHost,
            port: pvePort,
            ...tlsOpts,
            servername: tlsOpts.servername || pveHost,
        }, () => {
            // Build the HTTP upgrade request to Proxmox
            const headers = [
                `GET ${targetPath} HTTP/1.1`,
                `Host: ${pveHost}:${pvePort}`,
                `Upgrade: websocket`,
                `Connection: Upgrade`,
                // Authenticate with the PVE API token
                `Authorization: PVEAPIToken=${pveTokenId}=${pveTokenValue}`,
            ];

            // Forward WebSocket handshake headers from the client
            const fwd = [
                "sec-websocket-key",
                "sec-websocket-version",
                "sec-websocket-extensions",
                "sec-websocket-protocol",
            ];
            for (const h of fwd) {
                if (req.headers[h]) headers.push(`${capitalizeHeader(h)}: ${req.headers[h]}`);
            }

            headers.push("", ""); // trailing CRLF
            upstream.write(headers.join("\r\n"));

            // Send any buffered data from the client
            if (head && head.length > 0) upstream.write(head);

            // Log Proxmox's first response line once (101 = OK; 401/403 = auth/
            // ticket/permission; anything else points at the upstream, not Cloudflare).
            let logged = false;
            upstream.on("data", (chunk) => {
                if (logged) return;
                logged = true;
                console.log(`[vnc-proxy] upstream: ${chunk.toString("latin1").split("\r\n")[0]}`);
            });

            // Pipe bidirectionally (raw TCP tunnel, no frame parsing)
            upstream.pipe(socket);
            socket.pipe(upstream);
        });

        upstream.on("error", (err) => {
            console.error(`[vnc-proxy] Upstream error: ${err.message}`);
            socket.destroy();
        });

        socket.on("error", () => upstream.destroy());
        socket.on("close", () => upstream.destroy());
        upstream.on("close", () => socket.destroy());
    });

    server.listen(port, hostname, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
        if (pveHost) {
            console.log(`> VNC proxy: /novnc/* → wss://${pveHost}:${pvePort}/*`);
        }
    });

    // ── Hourly metered billing ──────────────────────────────────
    // Triggers the billing-cycle API every hour. The route itself is
    // idempotent (55-min gate), so restarts can't double-charge.
    const billingSecret = process.env.BILLING_CRON_SECRET;
    if (billingSecret) {
        const runCycle = () =>
            fetch(`http://127.0.0.1:${port}/api/billing/cycle`, {
                method: "POST",
                headers: { "x-billing-cron-secret": billingSecret },
            })
                .then(async (r) => console.log("[billing-cron]", r.status, await r.text()))
                .catch((e) => console.error("[billing-cron] failed:", e.message));
        setInterval(runCycle, 60 * 60 * 1000);
        setTimeout(runCycle, 30 * 1000); // catch-up shortly after boot
        console.log("> Hourly billing cron: enabled");
    } else {
        console.warn("> Hourly billing cron: DISABLED (set BILLING_CRON_SECRET)");
    }

    // ── Monitoring sweep ────────────────────────────────────────
    // Evaluates VM alert rules every 5 minutes and fires notifications.
    const monitoringSecret = process.env.MONITORING_CRON_SECRET;
    if (monitoringSecret) {
        const runSweep = () =>
            fetch(`http://127.0.0.1:${port}/api/monitoring/sweep`, {
                method: "POST",
                headers: { "x-monitoring-cron-secret": monitoringSecret },
            })
                .then(async (r) => console.log("[monitoring-cron]", r.status, await r.text()))
                .catch((e) => console.error("[monitoring-cron] failed:", e.message));
        setInterval(runSweep, 5 * 60 * 1000);
        setTimeout(runSweep, 45 * 1000); // shortly after boot
        console.log("> Monitoring sweep cron: enabled");
    } else {
        console.warn("> Monitoring sweep cron: DISABLED (set MONITORING_CRON_SECRET)");
    }
});

/** Capitalize header names: sec-websocket-key → Sec-Websocket-Key */
function capitalizeHeader(h) {
    return h.replace(/(^|-)(\w)/g, (_, sep, c) => sep + c.toUpperCase());
}
