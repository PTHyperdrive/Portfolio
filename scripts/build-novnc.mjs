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
    bundle:     true,
    format:     "esm",
    splitting:  true,           // Emits async chunks to handle top-level await in browser.js
    chunkNames: "chunk-[hash]",
    outdir:     "public/novnc",
    platform:   "browser",
    minify:     false,
    logLevel:   "info",
});
