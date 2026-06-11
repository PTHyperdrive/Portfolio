/**
 * Provision per-user VPCs on VLAN 50.
 *
 * Run this ON THE WEB VM (10.12.0.4) — it reaches both Proxmox (10.0.1.1)
 * and the MikroTik (10.12.0.1); a dev workstation cannot reach the router.
 *
 * For every user without a VLAN-50 VPC it:
 *   1. ensures the shared SDN VNet (tag 50) exists on Proxmox
 *   2. allocates a /28 hashed from the user id (collision-probed)
 *   3. creates the SDN subnet + applies SDN config
 *   4. adds the /28 gateway IP to the MikroTik vlan50 interface
 *   5. adds a forward-drop isolation rule (this /28 → 10.50.0.0/16)
 *   6. inserts the Vpc row
 *
 * Usage:
 *   npx tsx scripts/provision-vpcs.ts --dry-run     # preview, no changes
 *   npx tsx scripts/provision-vpcs.ts --yes         # provision for real
 */

import { createHash, randomBytes } from "crypto";
import https from "node:https";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

// ── Config ───────────────────────────────────────────────────────
const SHARED_VNET = process.env.PROXMOX_VPC_VNET || "vmcust50";
const SDN_ZONE = process.env.PROXMOX_SDN_ZONE || "NRSPVC";
const CUSTOMER_VLAN_IF = process.env.MIKROTIK_CUSTOMER_VLAN_IF || "vlan50-customers";
const VLAN_ID = 50;
const TOTAL_SUBNETS = 4096; // /28 blocks in 10.50.0.0/16

const DRY = !process.argv.includes("--yes");

// ── Subnet math (mirrors src/lib/vpc-subnet.ts) ──────────────────
const networkIdFor = (seed: string) => createHash("sha256").update(seed).digest("hex").slice(0, 8);
function netFromIndex(index: number, networkId: string) {
    const o3 = index >> 4, o4 = (index & 0xf) * 16;
    return {
        networkId, index,
        subnet: `10.50.${o3}.${o4}/28`,
        gateway: `10.50.${o3}.${o4 + 1}`,
        dhcpStart: `10.50.${o3}.${o4 + 2}`,
        dhcpEnd: `10.50.${o3}.${o4 + 14}`,
    };
}
function allocate(seed: string, used: Set<number>) {
    const start = parseInt(networkIdFor(seed), 16) % TOTAL_SUBNETS;
    for (let k = 0; k < TOTAL_SUBNETS; k++) {
        const i = (start + k) % TOTAL_SUBNETS;
        if (!used.has(i)) return netFromIndex(i, networkIdFor(`${seed}#${i}`));
    }
    throw new Error("pool exhausted");
}

// ── Proxmox (undici fetch, token auth) ───────────────────────────
const PVE = `https://${process.env.PROXMOX_VE_HOST}:${process.env.PROXMOX_VE_PORT}/api2/json`;
const PVE_AUTH = `PVEAPIToken=${process.env.PROXMOX_VE_TOKEN_ID}=${process.env.PROXMOX_VE_TOKEN_VALUE}`;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
async function pve(path: string, method = "GET", form?: Record<string, string | number>) {
    const r = await fetch(`${PVE}${path}`, {
        method,
        headers: { Authorization: PVE_AUTH, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
        body: form ? new URLSearchParams(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v)]))).toString() : undefined,
    });
    if (!r.ok) throw new Error(`PVE ${method} ${path} → ${r.status} ${await r.text().catch(() => "")}`);
    return r.json().catch(() => ({}));
}

// ── MikroTik (node https, RouterOS self-signed) ──────────────────
const MT_AUTH = "Basic " + Buffer.from(`${process.env.MIKROTIK_USER}:${process.env.MIKROTIK_PASSWORD || ""}`).toString("base64");
function mt(path: string, method = "GET", body?: object): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : undefined;
        const req = https.request({
            hostname: process.env.MIKROTIK_HOST,
            port: process.env.MIKROTIK_PORT || 443,
            path: "/rest" + path, method,
            headers: { Authorization: MT_AUTH, "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
            rejectUnauthorized: false,
        }, (res) => {
            let b = ""; res.on("data", (c) => b += c);
            res.on("end", () => (res.statusCode && res.statusCode < 300) ? resolve(b ? JSON.parse(b) : {}) : reject(new Error(`MT ${method} ${path} → ${res.statusCode} ${b}`)));
        });
        req.on("error", reject);
        if (data) req.write(data);
        req.end();
    });
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
    console.log(DRY ? "── DRY RUN (no changes; pass --yes to apply) ──" : "── PROVISIONING (live) ──");

    const conn = await mysql.createConnection(process.env.DATABASE_URL!);

    // Ensure shared VNet (tag 50)
    if (!DRY) {
        try {
            await pve("/cluster/sdn/vnets", "POST", { vnet: SHARED_VNET, zone: SDN_ZONE, tag: VLAN_ID, alias: "NRSP Customer VPCs (VLAN 50)" });
            console.log(`✔ shared VNet ${SHARED_VNET} created`);
        } catch (e) {
            if (/exist/i.test(String(e))) console.log(`• shared VNet ${SHARED_VNET} already exists`);
            else throw e;
        }
    } else {
        console.log(`would ensure shared VNet ${SHARED_VNET} (tag ${VLAN_ID}) in zone ${SDN_ZONE}`);
    }

    const [users] = await conn.execute("SELECT id, email FROM User ORDER BY createdAt ASC") as [{ id: string; email: string }[], unknown];

    // Tolerate the pre-migration state: if the networkIndex column doesn't
    // exist yet, treat the pool as empty so a dry run can still preview.
    let vpcs: { userId: string | null; networkIndex: number }[] = [];
    try {
        const [rows] = await conn.execute("SELECT userId, networkIndex FROM Vpc WHERE networkIndex IS NOT NULL") as [{ userId: string | null; networkIndex: number }[], unknown];
        vpcs = rows;
    } catch (e) {
        if (/Unknown column 'networkIndex'/.test(String(e))) {
            console.log("! Vpc.networkIndex column missing — run `prisma db push` before --yes.");
            if (!DRY) throw e;
        } else throw e;
    }

    const used = new Set(vpcs.map((v) => v.networkIndex));
    const haveVpc = new Set(vpcs.filter((v) => v.userId).map((v) => v.userId));

    let provisioned = 0;
    for (const u of users) {
        if (haveVpc.has(u.id)) { console.log(`• ${u.email}: already has a VLAN-50 VPC, skipping`); continue; }

        const net = allocate(`${u.id}:0`, used);
        used.add(net.index);
        console.log(`${DRY ? "would provision" : "→"} ${u.email}: ${net.subnet} gw ${net.gateway} (net ${net.networkId})`);
        if (DRY) continue;

        // Proxmox subnet
        await pve(`/cluster/sdn/vnets/${SHARED_VNET}/subnets`, "POST", { subnet: net.subnet, type: "subnet", gateway: net.gateway, snat: 0 });
        await pve("/cluster/sdn", "PUT"); // apply

        // MikroTik gateway IP + isolation
        await mt("/ip/address", "PUT", { address: `${net.gateway}/28`, interface: CUSTOMER_VLAN_IF, comment: `NRSP-VPC-${net.networkId}` });
        await mt("/ip/firewall/filter", "PUT", { chain: "forward", action: "drop", "src-address": net.subnet, "dst-address": "10.50.0.0/16", comment: `NRSP-VPC-${net.networkId}-isolation` });

        // DB row
        const id = randomBytes(16).toString("hex").slice(0, 25);
        await conn.execute(
            `INSERT INTO Vpc (id, userId, name, vlanId, networkId, networkIndex, vnetName, zoneName, mikrotikVlanIf, subnet, gateway, dhcpStart, dhcpEnd, isolate, status, description, createdAt, updatedAt)
             VALUES (?, ?, ?, 50, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE', ?, NOW(), NOW())`,
            [id, u.id, "Default VPC", net.networkId, net.index, SHARED_VNET, SDN_ZONE, CUSTOMER_VLAN_IF, net.subnet, net.gateway, net.dhcpStart, net.dhcpEnd, `Auto-provisioned for ${u.email}`]
        );
        provisioned++;
    }

    console.log(DRY ? "\nDry run complete." : `\n✔ Provisioned ${provisioned} VPC(s).`);
    await conn.end();
}

main().catch((e) => { console.error("Failed:", e); process.exit(1); });
