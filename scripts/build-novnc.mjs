/**
 * build-novnc.mjs
 *
 * Pre-bundles @novnc/novnc/lib/rfb into a self-contained IIFE that sets
 * window.RFBModule = { default: RFB }.
 *
 * The noVNC package has a top-level await in browser.js for H264 WebCodecs
 * feature detection. esbuild cannot bundle CJS require() of a file with TLA.
 * We use a plugin to strip the await at load-time — the detection becomes
 * synchronous (returns a Promise instead of a bool), which only breaks H264
 * encoding support. Core VNC/RFB functionality is completely unaffected.
 */

import { build } from "esbuild";
import { readFileSync, mkdirSync } from "fs";

mkdirSync("public", { recursive: true });

/** Plugin that strips top-level await from browser.js */
const stripTLAPlugin = {
    name: "strip-tla",
    setup(build) {
        build.onLoad({ filter: /util[/\\]browser\.js$/ }, (args) => {
            let code = readFileSync(args.path, "utf8");
            // Replace the TLA line:
            //   ... = await _checkWebCodecsH264DecodeSupport();
            // with a synchronous call (returns Promise, but that's fine):
            //   ... = _checkWebCodecsH264DecodeSupport();
            code = code.replace(
                /=\s*await\s+(_checkWebCodecsH264DecodeSupport\(\))/g,
                "= $1"
            );
            return { contents: code, loader: "js" };
        });
    },
};

await build({
    entryPoints: ["node_modules/@novnc/novnc/lib/rfb.js"],
    bundle:      true,
    format:      "iife",
    globalName:  "RFBModule",
    outfile:     "public/novnc-rfb.js",
    platform:    "browser",
    minify:      false,
    logLevel:    "info",
    plugins:     [stripTLAPlugin],
});
