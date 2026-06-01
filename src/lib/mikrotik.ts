/**
 * MikroTik RouterOS v7 REST API Client
 *
 * Connects to the RouterOS REST API (`/rest/...`) via HTTPS with
 * HTTP Basic Auth. Self-signed certificates are supported via
 * MIKROTIK_TLS_INSECURE=true (safe for internal LAN communication).
 *
 * Env vars:
 *   MIKROTIK_HOST          — Router IP or hostname (e.g. "10.0.0.1")
 *   MIKROTIK_PORT          — HTTPS port (default "443")
 *   MIKROTIK_USER          — API username (e.g. "nrsp-api")
 *   MIKROTIK_PASSWORD      — API password
 *   MIKROTIK_TLS_INSECURE  — "true" to skip TLS verification (self-signed)
 *   MIKROTIK_PARENT_INTERFACE — Physical interface for VLAN trunking (e.g. "ether2")
 */

import { Agent } from "undici";

// ─── Configuration ───────────────────────────────────────────────

const MT_HOST = process.env.MIKROTIK_HOST || "";
const MT_PORT = process.env.MIKROTIK_PORT || "443";
const MT_USER = process.env.MIKROTIK_USER || "";
const MT_PASS = process.env.MIKROTIK_PASSWORD || "";
const MT_INSECURE = process.env.MIKROTIK_TLS_INSECURE === "true";
const MT_PARENT_IF = process.env.MIKROTIK_PARENT_INTERFACE || "";
const MT_WG_IF = process.env.MIKROTIK_WG_INTERFACE || "Customers-WG1";
const MT_WG_ENDPOINT = process.env.MIKROTIK_WG_ENDPOINT || "";
const MT_WG_PORT = process.env.MIKROTIK_WG_PORT || "51822";
const MT_WG_SUBNET = process.env.MIKROTIK_WG_SUBNET || "10.98.0.0/24";
const MT_WG_GATEWAY = process.env.MIKROTIK_WG_GATEWAY || "10.98.0.1";

const MT_BASE = `https://${MT_HOST}:${MT_PORT}/rest`;
const MT_AUTH = "Basic " + Buffer.from(`${MT_USER}:${MT_PASS}`).toString("base64");

// ─── TLS Agent ───────────────────────────────────────────────────

const mikrotikAgent = new Agent({
    connect: {
        rejectUnauthorized: !MT_INSECURE,
    },
});

// ─── Error Class ─────────────────────────────────────────────────

export class MikroTikApiError extends Error {
    readonly statusCode: number;
    readonly detail: string;

    constructor(statusCode: number, message: string, detail = "") {
        super(`MikroTik ${statusCode}: ${message}`);
        this.name = "MikroTikApiError";
        this.statusCode = statusCode;
        this.detail = detail;
    }
}

// ─── Core Fetch ──────────────────────────────────────────────────

/**
 * Generic HTTP request to the MikroTik REST API.
 * All RouterOS REST endpoints return JSON.
 */
export async function mikrotikFetch(
    endpoint: string,
    options: RequestInit = {}
): Promise<unknown> {
    if (!MT_HOST) throw new MikroTikApiError(0, "MIKROTIK_HOST not configured");
    if (!MT_USER) throw new MikroTikApiError(0, "MIKROTIK_USER not configured");

    const url = `${MT_BASE}${endpoint}`;
    const headers: Record<string, string> = {
        Authorization: MT_AUTH,
        ...(options.headers as Record<string, string>),
    };

    if (options.body && typeof options.body === "string" && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
        ...options,
        headers,
        // @ts-expect-error -- undici dispatcher for TLS configuration
        dispatcher: mikrotikAgent,
    });

    if (!res.ok) {
        let body: { error?: number; message?: string; detail?: string } = {};
        try {
            body = (await res.json()) as typeof body;
        } catch {
            /* response may not be JSON */
        }
        throw new MikroTikApiError(
            res.status,
            body.message || res.statusText,
            body.detail || ""
        );
    }

    // Some endpoints return empty body (DELETE success)
    const text = await res.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

// ─── Health & System ─────────────────────────────────────────────

export interface SystemResource {
    "architecture-name": string;
    "board-name": string;
    "build-time": string;
    cpu: string;
    "cpu-count": string;
    "cpu-frequency": string;
    "cpu-load": string;
    "free-hdd-space": string;
    "free-memory": string;
    platform: string;
    "total-hdd-space": string;
    "total-memory": string;
    uptime: string;
    version: string;
}

export interface SystemIdentity {
    name: string;
}

export interface SystemHealthEntry {
    name: string;
    value: string;
    type: string;
}

/**
 * GET /rest/system/resource — CPU, memory, uptime, version info.
 */
export async function getSystemResource(): Promise<SystemResource> {
    const data = await mikrotikFetch("/system/resource");
    // RouterOS returns a single object (not array) for /system/resource
    if (Array.isArray(data)) return data[0] as SystemResource;
    return data as SystemResource;
}

/**
 * GET /rest/system/identity — Router name.
 */
export async function getSystemIdentity(): Promise<SystemIdentity> {
    const data = await mikrotikFetch("/system/identity");
    if (Array.isArray(data)) return data[0] as SystemIdentity;
    return data as SystemIdentity;
}

/**
 * GET /rest/system/health — Temperature, voltage, fan speed (hardware-dependent).
 */
export async function getSystemHealth(): Promise<SystemHealthEntry[]> {
    const data = await mikrotikFetch("/system/health");
    if (Array.isArray(data)) return data as SystemHealthEntry[];
    return [];
}

// ─── Connectivity Check ─────────────────────────────────────────

export type MikrotikStatus = "online" | "offline" | "auth_denied" | "error";

export interface PingResult {
    reachable: boolean;
    latencyMs: number;
    status: MikrotikStatus;
}

/**
 * Fast connectivity check — GET /rest/system/identity with 5s timeout.
 * Returns status and latency.
 */
export async function pingRouter(): Promise<PingResult> {
    if (!MT_HOST) {
        return { reachable: false, latencyMs: 0, status: "error" };
    }

    const start = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        const url = `${MT_BASE}/system/identity`;
        const res = await fetch(url, {
            method: "GET",
            headers: { Authorization: MT_AUTH },
            signal: controller.signal,
            // @ts-expect-error -- undici dispatcher
            dispatcher: mikrotikAgent,
        });

        const latencyMs = Math.round(performance.now() - start);

        if (res.ok) {
            return { reachable: true, latencyMs, status: "online" };
        }
        if (res.status === 401 || res.status === 403) {
            return { reachable: true, latencyMs, status: "auth_denied" };
        }
        return { reachable: true, latencyMs, status: "error" };
    } catch (err) {
        const latencyMs = Math.round(performance.now() - start);
        if ((err as Error).name === "AbortError") {
            return { reachable: false, latencyMs, status: "offline" };
        }
        // Connection refused, ECONNREFUSED, etc.
        return { reachable: false, latencyMs, status: "offline" };
    } finally {
        clearTimeout(timeout);
    }
}

// ─── Interfaces ──────────────────────────────────────────────────

export interface MtInterface {
    ".id": string;
    name: string;
    type: string;
    running: string;      // "true" | "false"
    disabled: string;
    "rx-byte": string;
    "tx-byte": string;
    "last-link-up-time"?: string;
    comment?: string;
}

export interface MtVlanInterface {
    ".id": string;
    name: string;
    "vlan-id": string;
    interface: string;
    running: string;
    disabled: string;
    comment?: string;
}

/**
 * GET /rest/interface — All interfaces with traffic counters.
 */
export async function getInterfaces(): Promise<MtInterface[]> {
    const data = await mikrotikFetch("/interface");
    return (data as MtInterface[]) ?? [];
}

/**
 * GET /rest/interface/vlan — VLAN interfaces only.
 */
export async function getVlanInterfaces(): Promise<MtVlanInterface[]> {
    const data = await mikrotikFetch("/interface/vlan");
    return (data as MtVlanInterface[]) ?? [];
}

// ─── IP Addresses ────────────────────────────────────────────────

export interface MtIpAddress {
    ".id": string;
    address: string;
    interface: string;
    network: string;
    disabled: string;
    dynamic: string;
    comment?: string;
}

/**
 * GET /rest/ip/address — All IP addresses.
 */
export async function getIpAddresses(): Promise<MtIpAddress[]> {
    const data = await mikrotikFetch("/ip/address");
    return (data as MtIpAddress[]) ?? [];
}

// ─── Firewall ────────────────────────────────────────────────────

export interface MtFirewallRule {
    ".id": string;
    chain: string;
    action: string;
    "src-address"?: string;
    "dst-address"?: string;
    comment?: string;
    disabled: string;
    bytes?: string;
    packets?: string;
}

/**
 * GET /rest/ip/firewall/filter — All filter rules.
 */
export async function getFirewallFilter(): Promise<MtFirewallRule[]> {
    const data = await mikrotikFetch("/ip/firewall/filter");
    return (data as MtFirewallRule[]) ?? [];
}

/**
 * GET /rest/ip/firewall/nat — All NAT rules.
 */
export async function getFirewallNat(): Promise<MtFirewallRule[]> {
    const data = await mikrotikFetch("/ip/firewall/nat");
    return (data as MtFirewallRule[]) ?? [];
}

// ─── VPC Automation ──────────────────────────────────────────────

/**
 * Create a VLAN interface on the MikroTik router.
 *
 * PUT /rest/interface/vlan → creates new VLAN sub-interface
 * on the parent interface facing Timox-1 NIC1.
 */
export async function createVlanInterface(
    vlanId: number,
    name: string,
    parentInterface: string = MT_PARENT_IF
): Promise<MtVlanInterface> {
    if (!parentInterface) throw new MikroTikApiError(0, "MIKROTIK_PARENT_INTERFACE not configured");
    const data = await mikrotikFetch("/interface/vlan", {
        method: "PUT",
        body: JSON.stringify({
            name,
            "vlan-id": String(vlanId),
            interface: parentInterface,
            comment: `NRSP VPC auto-provisioned`,
        }),
    });
    return data as MtVlanInterface;
}

/**
 * Delete a VLAN interface by name.
 */
export async function deleteVlanInterface(name: string): Promise<void> {
    // Find the interface ID first
    const vlans = await getVlanInterfaces();
    const target = vlans.find((v) => v.name === name);
    if (!target) return; // already gone

    await mikrotikFetch(`/interface/vlan/${target[".id"]}`, {
        method: "DELETE",
    });
}

/**
 * Add an IP address to an interface (used for VPC gateway).
 *
 * PUT /rest/ip/address
 */
export async function addIpAddress(
    address: string,
    interfaceName: string,
    comment?: string
): Promise<MtIpAddress> {
    const data = await mikrotikFetch("/ip/address", {
        method: "PUT",
        body: JSON.stringify({
            address,
            interface: interfaceName,
            ...(comment ? { comment } : {}),
        }),
    });
    return data as MtIpAddress;
}

/**
 * Remove an IP address by interface and address match.
 */
export async function removeIpAddress(
    address: string,
    interfaceName: string
): Promise<void> {
    const addrs = await getIpAddresses();
    const target = addrs.find(
        (a) => a.address === address && a.interface === interfaceName
    );
    if (!target) return;

    await mikrotikFetch(`/ip/address/${target[".id"]}`, {
        method: "DELETE",
    });
}

/**
 * Add a firewall isolation rule to prevent inter-VPC lateral movement.
 *
 * Inserts a DROP rule in the forward chain. Uses comment-based
 * identification for later cleanup.
 */
export async function addFirewallIsolationRule(
    srcSubnet: string,
    dstSubnet: string,
    comment: string
): Promise<MtFirewallRule> {
    const data = await mikrotikFetch("/ip/firewall/filter", {
        method: "PUT",
        body: JSON.stringify({
            chain: "forward",
            action: "drop",
            "src-address": srcSubnet,
            "dst-address": dstSubnet,
            comment,
        }),
    });
    return data as MtFirewallRule;
}

/**
 * Remove all firewall rules matching a specific comment string.
 * Used during VPC teardown to clean up isolation rules.
 */
export async function removeFirewallRulesByComment(
    comment: string
): Promise<number> {
    const rules = await getFirewallFilter();
    const targets = rules.filter((r) => r.comment === comment);

    let removed = 0;
    for (const rule of targets) {
        try {
            await mikrotikFetch(`/ip/firewall/filter/${rule[".id"]}`, {
                method: "DELETE",
            });
            removed++;
        } catch {
            // Non-fatal — rule may have been manually deleted
        }
    }
    return removed;
}

// ─── Aggregated Health Snapshot ───────────────────────────────────

export interface MikrotikHealthSnapshot {
    status: MikrotikStatus;
    latencyMs: number;
    identity: string;
    version: string;
    uptime: string;
    cpuLoad: number;
    cpuCount: number;
    memoryUsed: number;
    memoryTotal: number;
    boardName: string;
    architecture: string;
    interfaces: {
        name: string;
        type: string;
        running: boolean;
        disabled: boolean;
        rxBytes: number;
        txBytes: number;
    }[];
    vlanCount: number;
    firewallFilterCount: number;
    firewallNatCount: number;
    healthEntries: { name: string; value: string; type: string }[];
    timestamp: string;
}

/**
 * Collect a full health snapshot from the MikroTik router.
 * Aggregates multiple API calls into a single typed object.
 *
 * If the router is unreachable, returns a minimal object with
 * status = "offline" and zero values.
 */
export async function collectHealthSnapshot(): Promise<MikrotikHealthSnapshot> {
    const ping = await pingRouter();

    const empty: MikrotikHealthSnapshot = {
        status: ping.status,
        latencyMs: ping.latencyMs,
        identity: "",
        version: "",
        uptime: "",
        cpuLoad: 0,
        cpuCount: 0,
        memoryUsed: 0,
        memoryTotal: 0,
        boardName: "",
        architecture: "",
        interfaces: [],
        vlanCount: 0,
        firewallFilterCount: 0,
        firewallNatCount: 0,
        healthEntries: [],
        timestamp: new Date().toISOString(),
    };

    if (ping.status !== "online") return empty;

    try {
        const [resource, identity, health, ifaces, vlans, fwFilter, fwNat] =
            await Promise.allSettled([
                getSystemResource(),
                getSystemIdentity(),
                getSystemHealth(),
                getInterfaces(),
                getVlanInterfaces(),
                getFirewallFilter(),
                getFirewallNat(),
            ]);

        const res =
            resource.status === "fulfilled" ? resource.value : null;
        const id =
            identity.status === "fulfilled" ? identity.value : null;
        const hp =
            health.status === "fulfilled" ? health.value : [];
        const ifs =
            ifaces.status === "fulfilled" ? ifaces.value : [];
        const vls =
            vlans.status === "fulfilled" ? vlans.value : [];
        const fw =
            fwFilter.status === "fulfilled" ? fwFilter.value : [];
        const nat =
            fwNat.status === "fulfilled" ? fwNat.value : [];

        const totalMem = parseInt(res?.["total-memory"] ?? "0", 10);
        const freeMem = parseInt(res?.["free-memory"] ?? "0", 10);

        return {
            status: "online",
            latencyMs: ping.latencyMs,
            identity: id?.name ?? "",
            version: res?.version ?? "",
            uptime: res?.uptime ?? "",
            cpuLoad: parseInt(res?.["cpu-load"] ?? "0", 10),
            cpuCount: parseInt(res?.["cpu-count"] ?? "0", 10),
            memoryUsed: totalMem - freeMem,
            memoryTotal: totalMem,
            boardName: res?.["board-name"] ?? "",
            architecture: res?.["architecture-name"] ?? "",
            interfaces: ifs.map((i) => ({
                name: i.name,
                type: i.type,
                running: i.running === "true",
                disabled: i.disabled === "true",
                rxBytes: parseInt(i["rx-byte"] ?? "0", 10),
                txBytes: parseInt(i["tx-byte"] ?? "0", 10),
            })),
            vlanCount: vls.length,
            firewallFilterCount: fw.length,
            firewallNatCount: nat.length,
            healthEntries: hp,
            timestamp: new Date().toISOString(),
        };
    } catch {
        return { ...empty, status: "error" };
    }
}

// ─── WireGuard Peer Management ───────────────────────────────────

/**
 * Get WireGuard interface info (public key, listen port).
 * Used for building client configs.
 */
export async function getWgInterfaceInfo(interfaceName = MT_WG_IF) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ifaces: any[] = await mikrotikFetch("/interface/wireguard") as any[];
    const wg = ifaces.find((i) => i.name === interfaceName);
    if (!wg) throw new Error(`WireGuard interface '${interfaceName}' not found`);
    return {
        name: wg.name,
        publicKey: wg["public-key"] as string,
        listenPort: parseInt(wg["listen-port"] ?? "0", 10),
        running: wg.running === "true",
        disabled: wg.disabled === "true",
    };
}

/**
 * List all WireGuard peers, optionally filtered by interface.
 */
export async function listWgPeers(interfaceName?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const peers: any[] = await mikrotikFetch("/interface/wireguard/peers") as any[];
    const filtered = interfaceName
        ? peers.filter((p) => p.interface === interfaceName)
        : peers;

    return filtered.map((p) => ({
        id: p[".id"] as string,
        interface: p.interface as string,
        publicKey: p["public-key"] as string,
        allowedAddress: p["allowed-address"] as string,
        comment: (p.comment ?? "") as string,
        disabled: p.disabled === "true",
        lastHandshake: (p["last-handshake"] ?? "") as string,
        rx: parseInt(p.rx ?? "0", 10),
        tx: parseInt(p.tx ?? "0", 10),
    }));
}

/**
 * Add a WireGuard peer to the specified interface.
 * Returns the MikroTik `.id` for later deletion.
 */
export async function addWgPeer(opts: {
    publicKey: string;
    presharedKey?: string;
    allowedAddress: string;
    comment?: string;
    interfaceName?: string;
}): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
        interface: opts.interfaceName ?? MT_WG_IF,
        "public-key": opts.publicKey,
        "allowed-address": opts.allowedAddress,
    };
    if (opts.presharedKey) body["preshared-key"] = opts.presharedKey;
    if (opts.comment) body.comment = opts.comment;

    const result = await mikrotikFetch("/interface/wireguard/peers", {
        method: "PUT",
        body: JSON.stringify(body),
    });
    return result.ret as string; // MikroTik returns { "ret": "*1A" }
}

/**
 * Remove a WireGuard peer by its MikroTik .id
 */
export async function removeWgPeer(mikrotikId: string) {
    await mikrotikFetch(`/interface/wireguard/peers/${mikrotikId}`, {
        method: "DELETE",
    });
}

/**
 * Returns the WireGuard config constants needed for client config generation.
 */
export function getWgConfig() {
    return {
        interfaceName: MT_WG_IF,
        endpoint: MT_WG_ENDPOINT,
        port: MT_WG_PORT,
        subnet: MT_WG_SUBNET,
        gateway: MT_WG_GATEWAY,
    };
}
