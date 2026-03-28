/**
 * build-novnc.mjs
 *
 * Pre-bundles @novnc/novnc/lib/rfb into a self-contained IIFE that sets
 * window.RFBModule = { default: RFB }.
 *
 * Run automatically via `postinstall` so CI and fresh checkouts work.
 * Output is committed-friendly (deterministic, small diff) — or add
 * public/novnc-rfb.js to .gitignore if you prefer to always re-generate.
 */

import { build } from "esbuild";
import { mkdirSync } from "fs";

mkdirSync("public", { recursive: true });

await build({
    entryPoints: ["node_modules/@novnc/novnc/lib/rfb.js"],
    bundle:      true,
    format:      "iife",
    globalName:  "RFBModule",    // exposes window.RFBModule = { default: RFB }
    outfile:     "public/novnc-rfb.js",
    platform:    "browser",
    minify:      false,
    logLevel:    "info",

    // noVNC's browser.js uses top-level await for H264 WebCodecs detection.
    // Marking TLA as unsupported strips the await keyword — the feature
    // detection returns a Promise instead of a bool, breaking H264 only.
    // Core VNC/RFB functionality is completely unaffected.
    supported: {
        "top-level-await": false,
    },
});
