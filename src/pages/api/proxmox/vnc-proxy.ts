import type { NextApiRequest, NextApiResponse } from "next";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";

// This is a Pages API route (src/pages/api) because it allows access to the
// underlying Node.js HTTP server (res.socket.server) to attach the WebSocket upgrade listener.

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (!res.socket) {
        res.status(500).end("Socket not available");
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server = (res.socket as any).server;

    // Re-initialize on each code change by tracking a version
    const PROXY_VERSION = 3;
    if (server.vncProxyVersion !== PROXY_VERSION) {
        // Clean up old WSS if any
        if (server.vncWss) {
            server.vncWss.close();
        }

        console.log(`[VNC Relay] Initializing WebSocket Proxy v${PROXY_VERSION}...`);
        const wss = new WebSocketServer({ noServer: true });
        server.vncWss = wss;

        // Listen for standard HTTP upgrades
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        server.on("upgrade", (request: any, socket: any, head: any) => {
            if (request.url && request.url.includes("/api/proxmox/vnc-proxy")) {
                wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
                    wss.emit("connection", ws, request);
                });
            }
        });

        wss.on("connection", (clientWs: WebSocket, request: IncomingMessage) => {
            const url = new URL(request.url || "", `http://${request.headers.host}`);
            const node = url.searchParams.get("node");
            const vmId = url.searchParams.get("vmId");
            const port = url.searchParams.get("port");
            const vncticket = url.searchParams.get("vncticket");

            if (!node || !vmId || !port || !vncticket) {
                console.error("[VNC Relay] Missing parameters required to proxy");
                clientWs.close(1008, "Missing parameters");
                return;
            }

            const pveHost = process.env.PROXMOX_VE_HOST || "";
            const pvePort = process.env.PROXMOX_VE_PORT || "8006";
            const pveTokenId = process.env.PROXMOX_VE_TOKEN_ID || "";
            const pveTokenValue = process.env.PROXMOX_VE_TOKEN_VALUE || "";

            // Reconstruct the Proxmox websocket URL
            const proxmoxWsUrl = `wss://${pveHost}:${pvePort}/api2/json/nodes/${node}/qemu/${vmId}/vncwebsocket?port=${port}&vncticket=${encodeURIComponent(vncticket)}`;

            const wsHeaders = {
                "Authorization": `PVEAPIToken=${pveTokenId}=${pveTokenValue}`,
            };

            console.log(`[VNC Relay] Proxying VM ${vmId} on ${node}`);
            console.log(`[VNC Relay] URL: ${proxmoxWsUrl.substring(0, 80)}...`);
            console.log(`[VNC Relay] Auth: token=${pveTokenId ? "set" : "MISSING"}, cookie=set`);

            // Connect to Proxmox VE with binary sub-protocol and auth headers
            const proxmoxWs = new WebSocket(proxmoxWsUrl, ["binary"], {
                rejectUnauthorized: false,
                headers: wsHeaders,
            });

            proxmoxWs.on("open", () => {
                console.log("[VNC Relay] Connected to Proxmox VE successfully!");
            });

            // Proxy messages from Client -> Proxmox (binary frames)
            clientWs.on("message", (msg: WebSocket.RawData, isBinary: boolean) => {
                if (proxmoxWs.readyState === WebSocket.OPEN) {
                    proxmoxWs.send(msg, { binary: isBinary });
                }
            });

            // Proxy messages from Proxmox -> Client (binary frames)
            proxmoxWs.on("message", (msg: WebSocket.RawData, isBinary: boolean) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(msg, { binary: isBinary });
                }
            });

            // Cleanup when either side closes
            proxmoxWs.on("close", (code: number, reason: Buffer) => {
                console.log(`[VNC Relay] Proxmox WS closed: code=${code} reason=${reason.toString()}`);
                if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
            });
            clientWs.on("close", () => {
                if (proxmoxWs.readyState === WebSocket.OPEN) proxmoxWs.close();
            });

            // Error handling
            proxmoxWs.on("error", (err: Error) => {
                console.error("[VNC Relay] Proxmox WS Error:", err.message);
                if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
            });
            clientWs.on("error", (err: Error) => {
                console.error("[VNC Relay] Client WS Error:", err.message);
                if (proxmoxWs.readyState === WebSocket.OPEN) proxmoxWs.close();
            });
        });

        server.vncProxyVersion = PROXY_VERSION;
    }

    // End the HTTP request, leaving the WebSocket server to handle the upgrade
    res.status(200).send("VNC Proxy Ready");
}
