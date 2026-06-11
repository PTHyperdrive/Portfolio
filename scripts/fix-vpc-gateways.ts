/**
 * Move customer VPC gateway IPs from the vlan50-customers slave port onto the
 * br-vlan50 bridge, where they can actually answer ARP for VMs arriving via
 * RTL-ether1-2.5G (Proxmox Timox-1).
 *
 * Only touches addresses tagged with an NRSP-VPC-* comment. Idempotent.
 *
 *   npx tsx scripts/fix-vpc-gateways.ts            # dry-run (default)
 *   npx tsx scripts/fix-vpc-gateways.ts --yes      # apply
 */

import https from "node:https";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

const FROM_IF = "vlan50-customers";
const TO_IF = process.env.MIKROTIK_CUSTOMER_VLAN_IF || "br-vlan50";
const APPLY = process.argv.includes("--yes");

const H = process.env.MIKROTIK_HOST, P = process.env.MIKROTIK_PORT || "443";
const AUTH = "Basic " + Buffer.from(`${process.env.MIKROTIK_USER}:${process.env.MIKROTIK_PASSWORD || ""}`).toString("base64");

function mt(path: string, method = "GET", body?: object): Promise<{ status: number; data: unknown }> {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined;
        const req = https.request({
            hostname: H, port: P, path: "/rest" + path, method,
            headers: { Authorization: AUTH, "Content-Type": "application/json", ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) },
            rejectUnauthorized: false,
        }, (res) => { let b = ""; res.on("data", (c) => b += c); res.on("end", () => resolve({ status: res.statusCode || 0, data: b ? JSON.parse(b) : null })); });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function main() {
    console.log(APPLY ? "── APPLYING gateway migration ──" : "── DRY RUN (pass --yes to apply) ──");
    const addrs = (await mt("/ip/address")).data as Record<string, string>[];
    const moves = addrs.filter((a) => a.interface === FROM_IF && /^NRSP-VPC-/.test(a.comment || ""));

    if (moves.length === 0) { console.log("Nothing to migrate (no NRSP-VPC IPs on " + FROM_IF + ")."); return; }

    for (const a of moves) {
        console.log(`${APPLY ? "→" : "would move"} ${a.address}  ${FROM_IF} → ${TO_IF}  (${a.comment})`);
        if (!APPLY) continue;
        // Re-home: add on the bridge first, then drop the slave-port copy.
        await mt("/ip/address", "PUT", { address: a.address, interface: TO_IF, comment: a.comment });
        await mt(`/ip/address/${a[".id"]}`, "DELETE");
    }
    console.log(APPLY ? `✔ Moved ${moves.length} gateway(s) to ${TO_IF}.` : `\nRe-run with --yes to apply (${moves.length} to move).`);
}

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
