/**
 * Backfill per-user VPCs (per-VLAN model). For each user without a VPC:
 *   - allocate next-free VLAN (1001-2000) + a /28 hashed from the user id
 *   - Proxmox: SDN VNet (VLAN tag) in NRSPVLAN zone + subnet + apply
 *   - MikroTik: vlan<tag>-cust on the customer trunk + gateway IP + DHCP
 *   - insert the Vpc row
 *
 *   npx tsx scripts/backfill-vpcs.ts                       # dry-run, all users
 *   npx tsx scripts/backfill-vpcs.ts --only a@b.com --yes  # one user, live
 *   npx tsx scripts/backfill-vpcs.ts --yes                 # all users, live
 */

import { createHash, randomBytes } from "crypto";
import https from "node:https";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

const ZONE = process.env.PROXMOX_SDN_ZONE || "NRSPVLAN";
const TRUNK = process.env.MIKROTIK_CUSTOMER_TRUNK || "RTL-ether1-2.5G";
const VLAN_MIN = 1001, VLAN_MAX = 2000, TOTAL_SUBNETS = 4096;
const DRY = !process.argv.includes("--yes");
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

// /28 hashed from user id (mirrors src/lib/vpc-subnet.ts)
const netId = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);
function netFromIndex(i: number, id: string) {
    const o3 = i >> 4, o4 = (i & 0xf) * 16;
    return { networkId: id, index: i, subnet: `10.50.${o3}.${o4}/28`, gateway: `10.50.${o3}.${o4 + 1}`, dhcpStart: `10.50.${o3}.${o4 + 2}`, dhcpEnd: `10.50.${o3}.${o4 + 14}` };
}
function allocNet(seed: string, used: Set<number>) {
    const start = parseInt(netId(seed), 16) % TOTAL_SUBNETS;
    for (let k = 0; k < TOTAL_SUBNETS; k++) { const i = (start + k) % TOTAL_SUBNETS; if (!used.has(i)) return netFromIndex(i, netId(`${seed}#${i}`)); }
    throw new Error("subnet pool exhausted");
}
function allocVlan(used: Set<number>) { for (let v = VLAN_MIN; v <= VLAN_MAX; v++) if (!used.has(v)) return v; throw new Error("vlan pool exhausted"); }

// Proxmox
const PVE = `https://${process.env.PROXMOX_VE_HOST}:${process.env.PROXMOX_VE_PORT}/api2/json`;
const PAUTH = `PVEAPIToken=${process.env.PROXMOX_VE_TOKEN_ID}=${process.env.PROXMOX_VE_TOKEN_VALUE}`;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
async function pve(path: string, method = "GET", form?: Record<string, string | number>) {
    const r = await fetch(`${PVE}${path}`, { method, headers: { Authorization: PAUTH, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body: form ? new URLSearchParams(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v)]))).toString() : undefined });
    if (!r.ok) throw new Error(`PVE ${method} ${path} ${r.status} ${await r.text().catch(() => "")}`);
    return r.json().catch(() => ({}));
}

// MikroTik
const MAUTH = "Basic " + Buffer.from(`${process.env.MIKROTIK_USER}:${process.env.MIKROTIK_PASSWORD || ""}`).toString("base64");
function mt(path: string, method = "GET", body?: object): Promise<unknown> {
    return new Promise((res, rej) => {
        const data = body ? JSON.stringify(body) : undefined;
        const req = https.request({ hostname: process.env.MIKROTIK_HOST, port: process.env.MIKROTIK_PORT || 443, path: "/rest" + path, method, headers: { Authorization: MAUTH, "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) }, rejectUnauthorized: false },
            (r) => { let b = ""; r.on("data", (c) => b += c); r.on("end", () => (r.statusCode && r.statusCode < 300) ? res(b ? JSON.parse(b) : {}) : rej(new Error(`MT ${method} ${path} ${r.statusCode} ${b}`))); });
        req.on("error", rej); if (data) req.write(data); req.end();
    });
}

async function main() {
    console.log(DRY ? "── DRY RUN (--yes to apply) ──" : "── BACKFILL (live) ──", ONLY ? `only=${ONLY}` : "all users");
    const conn = await mysql.createConnection(process.env.DATABASE_URL!);
    const [users] = await conn.execute("SELECT id, email FROM User ORDER BY createdAt ASC") as [{ id: string; email: string }[], unknown];
    const [vpcs] = await conn.execute("SELECT userId, vlanId, networkIndex FROM Vpc") as [{ userId: string | null; vlanId: number; networkIndex: number | null }[], unknown];
    const usedVlans = new Set(vpcs.map((v) => v.vlanId));
    const usedNets = new Set(vpcs.map((v) => v.networkIndex).filter((i): i is number => i != null));
    const have = new Set(vpcs.filter((v) => v.userId).map((v) => v.userId));

    let done = 0;
    for (const u of users) {
        if (ONLY && u.email !== ONLY) continue;
        if (have.has(u.id)) { console.log(`• ${u.email}: already has a VPC`); continue; }
        const vlan = allocVlan(usedVlans); usedVlans.add(vlan);
        const net = allocNet(`${u.id}:0`, usedNets); usedNets.add(net.index);
        const vnet = `vc${vlan}`, vif = `vlan${vlan}-cust`, cmt = `NRSP-VPC-${net.networkId}`;
        console.log(`${DRY ? "would provision" : "→"} ${u.email}: VLAN ${vlan} ${net.subnet} gw ${net.gateway} vnet ${vnet}`);
        if (DRY) continue;

        // Proxmox SDN VNet + subnet
        await pve("/cluster/sdn/vnets", "POST", { vnet, zone: ZONE, tag: vlan, alias: `VPC ${u.email}` });
        await pve(`/cluster/sdn/vnets/${vnet}/subnets`, "POST", { subnet: net.subnet, type: "subnet", gateway: net.gateway, snat: 0 });
        await pve("/cluster/sdn", "PUT");

        // MikroTik VLAN iface + gateway + DHCP
        await mt("/interface/vlan", "PUT", { name: vif, "vlan-id": String(vlan), interface: TRUNK, comment: cmt });
        await mt("/ip/address", "PUT", { address: `${net.gateway}/28`, interface: vif, comment: cmt });
        await mt("/ip/pool", "PUT", { name: cmt, ranges: `${net.dhcpStart}-${net.dhcpEnd}`, comment: cmt });
        await mt("/ip/dhcp-server/network", "PUT", { address: net.subnet, gateway: net.gateway, "dns-server": "8.8.8.8,1.1.1.1", comment: cmt });
        await mt("/ip/dhcp-server", "PUT", { name: cmt, interface: vif, "address-pool": cmt, "lease-time": "1d", disabled: "false", comment: cmt });

        // DB row
        const id = randomBytes(16).toString("hex").slice(0, 25);
        await conn.execute(
            `INSERT INTO Vpc (id, userId, name, vlanId, networkId, networkIndex, vnetName, zoneName, mikrotikVlanIf, subnet, gateway, dhcpStart, dhcpEnd, isolate, status, description, createdAt, updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,'ACTIVE',?,NOW(),NOW())`,
            [id, u.id, "Default VPC", vlan, net.networkId, net.index, vnet, ZONE, vif, net.subnet, net.gateway, net.dhcpStart, net.dhcpEnd, `Auto for ${u.email}`]
        );
        done++;
        console.log(`  ✔ provisioned ${u.email}`);
    }
    console.log(DRY ? "\nDry run complete." : `\n✔ Backfilled ${done} VPC(s).`);
    await conn.end();
}
main().catch((e) => { console.error("Failed:", e); process.exit(1); });
