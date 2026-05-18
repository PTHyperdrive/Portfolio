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
import pkg from "@next/env";
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

    if (!pveHost) {
        console.warn("[vnc-proxy] PROXMOX_VE_HOST not set — VNC proxy disabled");
    }

    const server = createServer(handle);

    // ── WebSocket upgrade handler ───────────────────────────────
    server.on("upgrade", (req, socket, head) => {
        const url = req.url || "";

        // Only intercept /novnc/ paths; let Next.js handle HMR etc.
        if (!url.startsWith("/novnc/") || !pveHost) return;

        // Strip the /novnc prefix → forward to Proxmox VE
        const targetPath = url.replace(/^\/novnc/, "");

        console.log(`[vnc-proxy] Upgrading: ${targetPath.slice(0, 80)}…`);

        // Open a TLS connection to Proxmox
        const upstream = tlsConnect({
            host: pveHost,
            port: pvePort,
            ...tlsOpts,
            // Use VE host as SNI servername if not overridden
            servername: tlsOpts.servername || pveHost,
        }, () => {
            // Build the HTTP upgrade request to Proxmox
            const headers = [
                `GET ${targetPath} HTTP/1.1`,
                `Host: ${pveHost}:${pvePort}`,
                `Upgrade: websocket`,
                `Connection: Upgrade`,
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
});

/** Capitalize header names: sec-websocket-key → Sec-Websocket-Key */
function capitalizeHeader(h) {
    return h.replace(/(^|-)(\w)/g, (_, sep, c) => sep + c.toUpperCase());
}
