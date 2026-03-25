import type { NextApiRequest, NextApiResponse } from "next";
import fs from "node:fs";
import path from "node:path";

/**
 * GET /api/novnc/[...path]
 *
 * Serves noVNC library files directly from the server's node_modules.
 * This lets the browser load noVNC from our own domain without any CDN
 * or direct connection to the Proxmox host.
 *
 * noVNC uses internal ES module relative imports (e.g. ./decoders/xyz.js),
 * which resolve correctly because all files live under the same base path.
 */

const NOVNC_ROOT = path.join(process.cwd(), "node_modules/@novnc/novnc");

const MIME: Record<string, string> = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    const segments = req.query.path as string[];
    if (!segments || segments.length === 0) {
        return res.status(400).send("No path specified");
    }

    // Prevent directory traversal
    const relative = path.normalize(segments.join("/"));
    if (relative.startsWith("..")) {
        return res.status(403).send("Forbidden");
    }

    const filePath = path.join(NOVNC_ROOT, relative);

    if (!filePath.startsWith(NOVNC_ROOT)) {
        return res.status(403).send("Forbidden");
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return res.status(404).send("Not found");
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";

    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=86400"); // cache 1 day
    res.setHeader("Access-Control-Allow-Origin", "*");

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
}
