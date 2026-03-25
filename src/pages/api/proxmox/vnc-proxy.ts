import type { NextApiRequest, NextApiResponse } from "next";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";

// Need to completely bypass body parsing since this is a proxy route handling raw TCP data
export const config = {
    api: {
        bodyParser: false,
    },
};

const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols: Set<string>) => {
        if (protocols.has("binary")) return "binary";
        if (protocols.has("base64")) return "base64";
        return false;
    }
});

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    // If it's a regular HTTP request (like our wakeup fetch), just return 200
    if (req.headers.upgrade?.toLowerCase() !== "websocket") {
        return res.status(200).send("VNC Proxy Ready");
    }

    if (!res.socket) {
        return res.status(500).end("Socket not available");
    }

    const socket = res.socket as any;
    // Next.js might send the HTTP headers if we don't mark the request as hijacked
    // We intentionally don't call res.end() or res.send() here, otherwise it corrupts the WS stream!

    wss.handleUpgrade(req, socket, Buffer.alloc(0), (clientWs: WebSocket) => {
        // Connected!
        const url = new URL(req.url || "", `http://${req.headers.host}`);
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

        console.log(`[VNC Relay] Proxying VM ${vmId} on ${node}`);
        console.log(`[VNC Relay] URL: ${proxmoxWsUrl.substring(0, 80)}...`);

        // Connect to Proxmox VE with binary sub-protocol
        // Authentication requires the PVEAPIToken for the HTTP Upgrade hook
        const proxmoxWs = new WebSocket(proxmoxWsUrl, ["binary"], {
            rejectUnauthorized: false,
            headers: {
                "Authorization": `PVEAPIToken=${pveTokenId}=${pveTokenValue}`,
            },
        });

        proxmoxWs.on("open", () => {
            console.log("[VNC Relay] Connected to Proxmox VE successfully!");
        });

        // Proxy messages from Client -> Proxmox (binary frames)
        clientWs.on("message", (msg: WebSocket.RawData, isBinary: boolean) => {
            const len = Array.isArray(msg) ? msg.reduce((a, b) => a + b.length, 0) : (msg as Buffer).length;
            console.log(`[VNC Relay] Client -> Proxmox (${isBinary ? "binary" : "text"}): ${len} bytes`);
            if (proxmoxWs.readyState === WebSocket.OPEN) {
                proxmoxWs.send(msg, { binary: true }); // Always force binary to Proxmox
            }
        });

        // Proxy messages from Proxmox -> Client (binary frames)
        proxmoxWs.on("message", (msg: WebSocket.RawData, isBinary: boolean) => {
            const len = Array.isArray(msg) ? msg.reduce((a, b) => a + b.length, 0) : (msg as Buffer).length;
            console.log(`[VNC Relay] Proxmox -> Client (${isBinary ? "binary" : "text"}): ${len} bytes`);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(msg, { binary: true }); // Always force binary to Browser
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
}
