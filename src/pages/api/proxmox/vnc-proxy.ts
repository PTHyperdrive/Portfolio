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

    // Prevent multiple WebSocketServer instances during Next.js HMR or multiple calls
    if (!server.vncProxyInitialized) {
        console.log("[VNC Relay] Initializing Next.js WebSocket Proxy...");
        const wss = new WebSocketServer({ noServer: true });

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

            // Reconstruct the Proxmox websocket URL targeting the Proxmox instance
            const proxmoxWsUrl = `wss://${pveHost}:${pvePort}/api2/json/nodes/${node}/qemu/${vmId}/vncwebsocket?port=${port}&vncticket=${encodeURIComponent(vncticket)}`;
            console.log(`[VNC Relay] Proxying connection for VM ${vmId} on ${node}`);

            // Connect to Proxmox VE with binary sub-protocol and auth headers
            // Proxmox requires the VNC ticket as a PVEAuthCookie AND the API token
            const proxmoxWs = new WebSocket(proxmoxWsUrl, ["binary"], {
                rejectUnauthorized: false,
                headers: {
                    "Cookie": `PVEAuthCookie=${encodeURIComponent(vncticket)}`,
                    "Authorization": `PVEAPIToken=${pveTokenId}=${pveTokenValue}`,
                },
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
            proxmoxWs.on("close", () => {
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

        server.vncProxyInitialized = true;
    }

    // End the HTTP request, leaving the WebSocket server to handle the upgrade
    res.status(200).send("VNC Proxy Ready");
}
