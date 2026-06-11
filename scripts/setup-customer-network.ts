/**
 * Configure the MikroTik for the customer VLAN-50 network:
 *   1. Isolation — customers reach ONLY the internet (+ their gateway):
 *        drop 10.50.0.0/16 → 10.0.0.0/8 / 172.16.0.0/12 / 192.168.0.0/16
 *        accept 10.50.0.0/16 → internet
 *      (per-/28 customer↔customer drops are added by VPC provisioning.)
 *   2. Dual-WAN load balancing — all customer traffic egresses pppoe-out3 +
 *      pppoe-out4, balanced per-connection (PCC), with failover to the other
 *      WAN if one drops.
 *
 * Idempotent: every rule is tagged with an `NRSP-CUST-*` comment and skipped
 * if already present. Safe to re-run.
 *
 * Run ON A HOST THAT REACHES THE ROUTER (web VM, or this box at 10.0.0.1):
 *   npx tsx scripts/setup-customer-network.ts            # dry-run (default)
 *   npx tsx scripts/setup-customer-network.ts --yes      # apply
 */

import https from "node:https";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

const CUST_NET = "10.50.0.0/16";
const WAN_A = "pppoe-out3";
const WAN_B = "pppoe-out4";
const TABLE_A = "cust-wan3";
const TABLE_B = "cust-wan4";
const APPLY = process.argv.includes("--yes");

// ── MikroTik REST (node https; RouterOS self-signed) ─────────────
const H = process.env.MIKROTIK_HOST, P = process.env.MIKROTIK_PORT || "443";
const AUTH = "Basic " + Buffer.from(`${process.env.MIKROTIK_USER}:${process.env.MIKROTIK_PASSWORD || ""}`).toString("base64");

function mt(path: string, method = "GET", body?: object): Promise<{ status: number; data: unknown }> {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined;
        const req = https.request({
            hostname: H, port: P, path: "/rest" + path, method,
            headers: { Authorization: AUTH, "Content-Type": "application/json", ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) },
            rejectUnauthorized: false,
        }, (res) => {
            let b = ""; res.on("data", (c) => b += c);
            res.on("end", () => resolve({ status: res.statusCode || 0, data: b ? JSON.parse(b) : null }));
        });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function existing(path: string): Promise<Record<string, unknown>[]> {
    const r = await mt(path);
    return Array.isArray(r.data) ? r.data as Record<string, unknown>[] : [];
}

/** Add an item only if no existing row already carries the same comment. */
async function ensure(path: string, body: Record<string, unknown>, present: Record<string, unknown>[]) {
    const cmt = body.comment as string;
    if (present.some((r) => r.comment === cmt)) {
        console.log(`  • exists: ${cmt}`);
        return;
    }
    if (!APPLY) {
        console.log(`  + would add: ${cmt}  →  ${JSON.stringify(body)}`);
        return;
    }
    const r = await mt(path, "PUT", body);
    console.log(`  + added (${r.status}): ${cmt}`);
}

async function main() {
    console.log(APPLY ? "── APPLYING customer network config ──" : "── DRY RUN (pass --yes to apply) ──");

    // Sanity: confirm the WANs exist and are in the WAN interface list (NAT).
    const pppoe = await existing("/interface/pppoe-client");
    for (const w of [WAN_A, WAN_B]) {
        const f = pppoe.find((p) => p.name === w);
        console.log(`WAN ${w}: ${f ? `running=${f.running}` : "!! NOT FOUND"}`);
    }
    const wanList = await existing("/interface/list/member");
    for (const w of [WAN_A, WAN_B]) {
        const inWan = wanList.some((m) => m.list === "WAN" && m.interface === w);
        if (!inWan) console.log(`  ! ${w} not in interface-list WAN — the "NAT Outbound" masquerade may not cover it.`);
    }

    // ── 1. Isolation (firewall filter, forward chain) ────────────
    console.log("\n[1] Isolation rules (10.50.0.0/16 → internet only):");
    const fw = await existing("/ip/firewall/filter");
    await ensure("/ip/firewall/filter", { chain: "forward", action: "drop", "src-address": CUST_NET, "dst-address": "10.0.0.0/8", comment: "NRSP-CUST-block-rfc1918a" }, fw);
    await ensure("/ip/firewall/filter", { chain: "forward", action: "drop", "src-address": CUST_NET, "dst-address": "172.16.0.0/12", comment: "NRSP-CUST-block-rfc1918b" }, fw);
    await ensure("/ip/firewall/filter", { chain: "forward", action: "drop", "src-address": CUST_NET, "dst-address": "192.168.0.0/16", comment: "NRSP-CUST-block-rfc1918c" }, fw);
    await ensure("/ip/firewall/filter", { chain: "forward", action: "accept", "src-address": CUST_NET, comment: "NRSP-CUST-internet" }, fw);

    // ── 2. Dual-WAN PCC load balancing ───────────────────────────
    console.log("\n[2] Routing tables:");
    const tables = await existing("/routing/table");
    for (const [t] of [[TABLE_A], [TABLE_B]] as const) {
        if (tables.some((x) => x.name === t)) console.log(`  • exists: table ${t}`);
        else if (!APPLY) console.log(`  + would add table ${t} (fib)`);
        else { await mt("/routing/table", "PUT", { name: t, fib: "true" }); console.log(`  + added table ${t}`); }
    }

    console.log("\n[3] Per-WAN default routes (with failover):");
    const routes = await existing("/ip/route");
    // Primary route in each table → its WAN; fallback (higher distance) → the other.
    const routePlan = [
        { table: TABLE_A, gw: WAN_A, distance: "1", comment: "NRSP-CUST-route-wan3" },
        { table: TABLE_A, gw: WAN_B, distance: "2", comment: "NRSP-CUST-route-wan3-fallback" },
        { table: TABLE_B, gw: WAN_B, distance: "1", comment: "NRSP-CUST-route-wan4" },
        { table: TABLE_B, gw: WAN_A, distance: "2", comment: "NRSP-CUST-route-wan4-fallback" },
    ];
    for (const r of routePlan) {
        await ensure("/ip/route", {
            "dst-address": "0.0.0.0/0", gateway: r.gw, "routing-table": r.table,
            distance: r.distance, "check-gateway": "ping", comment: r.comment,
        }, routes);
    }

    console.log("\n[4] PCC mangle (mark + route customer connections):");
    const mangle = await existing("/ip/firewall/mangle");
    // Mark NEW connections from customers, split evenly across the 2 WANs.
    await ensure("/ip/firewall/mangle", { chain: "prerouting", "src-address": CUST_NET, "connection-state": "new", "per-connection-classifier": "both-addresses:2/0", action: "mark-connection", "new-connection-mark": "cust-wan3-conn", passthrough: "yes", comment: "NRSP-CUST-pcc-wan3" }, mangle);
    await ensure("/ip/firewall/mangle", { chain: "prerouting", "src-address": CUST_NET, "connection-state": "new", "per-connection-classifier": "both-addresses:2/1", action: "mark-connection", "new-connection-mark": "cust-wan4-conn", passthrough: "yes", comment: "NRSP-CUST-pcc-wan4" }, mangle);
    // Route marked connections out their assigned WAN table.
    await ensure("/ip/firewall/mangle", { chain: "prerouting", "src-address": CUST_NET, "connection-mark": "cust-wan3-conn", action: "mark-routing", "new-routing-mark": TABLE_A, passthrough: "no", comment: "NRSP-CUST-route-mark-wan3" }, mangle);
    await ensure("/ip/firewall/mangle", { chain: "prerouting", "src-address": CUST_NET, "connection-mark": "cust-wan4-conn", action: "mark-routing", "new-routing-mark": TABLE_B, passthrough: "no", comment: "NRSP-CUST-route-mark-wan4" }, mangle);

    console.log(APPLY
        ? "\n✔ Applied. Verify: customer VM should egress via pppoe-out3/out4 and cannot reach 10.x/172.16/192.168."
        : "\nDry run complete. Re-run with --yes to apply.");
    if (APPLY) {
        console.log("NOTE: isolation drops were appended; confirm they sit BEFORE any broad 'accept' in /ip/firewall/filter (move if needed).");
    }
}

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
