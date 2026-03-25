/**
 * Proxmox API Client
 * 
 * Centralized HTTP client for communicating with:
 * 1. Proxmox Manager API (proxmox-renting-upkeep) — VM tracking, pricing, rentals
 * 2. Proxmox VE API — Direct spice ticket generation
 */

import { Agent } from "undici";

// Shared dispatcher that skips TLS validation for internal APIs
// (Proxmox uses self-signed certs / certs issued for FQDN, not IP)
const insecureAgent = new Agent({
    connect: { rejectUnauthorized: false },
});

// ─── Manager API Client ──────────────────────────────────────────

const MANAGER_URL = process.env.PROXMOX_MANAGER_URL || "";
const MANAGER_API_KEY = process.env.PROXMOX_API_KEY || "";

async function managerFetch(endpoint: string, options: RequestInit = {}) {
    if (!MANAGER_URL) throw new Error("PROXMOX_MANAGER_URL is not configured in the server");
    const url = `${MANAGER_URL}${endpoint}`;
    const headers: Record<string, string> = {
        "X-API-Key": MANAGER_API_KEY,
        ...(options.headers as Record<string, string>),
    };

    if (options.body && typeof options.body === "string" && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
        ...options,
        headers,
        // @ts-expect-error -- undici dispatcher for TLS bypass
        dispatcher: insecureAgent,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(`Manager API ${res.status}: ${text}`);
    }

    return res.json();
}

// ─── VM Endpoints (Manager) ──────────────────────────────────────

export async function fetchAllVMs(node?: string) {
    const params = node ? `?node=${encodeURIComponent(node)}` : "";
    return managerFetch(`/api/vms${params}`);
}

export async function fetchVM(vmId: string, node?: string) {
    const params = node ? `?node=${encodeURIComponent(node)}` : "";
    return managerFetch(`/api/vms/${vmId}${params}`);
}

export async function fetchVMUsage(vmId: string, startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return managerFetch(`/api/vms/${vmId}/usage${qs}`);
}

// ─── Rental Endpoints (Manager) ──────────────────────────────────

export async function fetchRentals() {
    return managerFetch("/api/rentals");
}

export async function fetchRentalReport(rentalId: number) {
    return managerFetch(`/api/rentals/${rentalId}/report`);
}

// ─── Node Endpoints (Manager) ────────────────────────────────────

export async function fetchNodes() {
    return managerFetch("/api/nodes");
}

// ─── Session Endpoints (Manager) ─────────────────────────────────

export async function fetchSessions(vmId?: string, limit?: number) {
    const params = new URLSearchParams();
    if (vmId) params.set("vm_id", vmId);
    if (limit) params.set("limit", limit.toString());
    const qs = params.toString() ? `?${params.toString()}` : "";
    return managerFetch(`/api/sessions${qs}`);
}

// ─── Pricing Endpoints (Manager) ─────────────────────────────────

export async function fetchPricingTiers(activeOnly = true) {
    return managerFetch(`/api/pricing/tiers?active_only=${activeOnly}`);
}

export async function fetchPricingTier(tierId: number) {
    return managerFetch(`/api/pricing/tiers/${tierId}`);
}

export async function updatePricingTier(tierId: number, data: Record<string, unknown>) {
    return managerFetch(`/api/pricing/tiers/${tierId}`, {
        method: "PUT",
        body: JSON.stringify(data),
    });
}

export async function fetchGPUResources() {
    return managerFetch("/api/pricing/gpu-resources");
}

export async function updateGPUResource(gpuId: number, data: Record<string, unknown>) {
    return managerFetch(`/api/pricing/gpu-resources/${gpuId}`, {
        method: "PUT",
        body: JSON.stringify(data),
    });
}

export async function calculatePricing(config: {
    vcpu: number;
    ram_gb: number;
    nvme_gb?: number;
    gpu_id?: number;
    hours_per_day?: number;
    days_per_month?: number;
    profit_margin_percent?: number;
}) {
    return managerFetch("/api/pricing/calculate", {
        method: "POST",
        body: JSON.stringify(config),
    });
}

export async function quickPriceEstimate(vcpu: number, ramGb: number, nvmeGb = 0, gpuId?: number, margin = 30) {
    const params = new URLSearchParams({
        vcpu: vcpu.toString(),
        ram_gb: ramGb.toString(),
        nvme_gb: nvmeGb.toString(),
        margin: margin.toString(),
    });
    if (gpuId) params.set("gpu_id", gpuId.toString());
    return managerFetch(`/api/pricing/quick-estimate?${params.toString()}`);
}

// ─── Customer / Billing (Manager) ────────────────────────────────

export async function fetchCustomerBilling() {
    return managerFetch("/api/customers/billing");
}

// ─── Proxmox VE Direct API ───────────────────────────────────────

const PVE_HOST = process.env.PROXMOX_VE_HOST || "";
const PVE_PORT = process.env.PROXMOX_VE_PORT || "";
const PVE_TOKEN_ID = process.env.PROXMOX_VE_TOKEN_ID || "";
const PVE_TOKEN_VALUE = process.env.PROXMOX_VE_TOKEN_VALUE || "";

const PVE_BASE = `https://${PVE_HOST}:${PVE_PORT}/api2/json`;

async function pveFetch(endpoint: string, options: RequestInit = {}) {
    const url = `${PVE_BASE}${endpoint}`;
    const headers: Record<string, string> = {
        "Authorization": `PVEAPIToken=${PVE_TOKEN_ID}=${PVE_TOKEN_VALUE}`,
        ...(options.headers as Record<string, string>),
    };

    if (options.body && typeof options.body === "string" && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
        ...options,
        headers,
        // @ts-expect-error -- undici dispatcher for TLS bypass
        dispatcher: insecureAgent,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(`Proxmox VE ${res.status}: ${text}`);
    }

    const json = await res.json();
    return json.data;
}

/**
 * Request a VNC proxy ticket for a VM.
 * Returns { ticket, port } for noVNC connection.
 */
export async function getVncTicket(node: string, vmId: string, vmType: "qemu" | "lxc" = "qemu") {
    const data = await pveFetch(`/nodes/${node}/${vmType}/${vmId}/vncproxy`, {
        method: "POST",
        body: JSON.stringify({ websocket: 1, "generate-password": 1 }),
    });
    return {
        ticket: data.ticket as string,
        port: data.port as number,
        password: data.password as string,
    };
}

/**
 * Request a SPICE proxy ticket for a VM.
 * Returns the full SPICE config for generating a .vv file.
 */
export async function getSpiceTicket(node: string, vmId: string, vmType: "qemu" | "lxc" = "qemu") {
    const data = await pveFetch(`/nodes/${node}/${vmType}/${vmId}/spiceproxy`, {
        method: "POST",
        body: JSON.stringify({ proxy: PVE_HOST }),
    });
    return data as {
        host: string;
        password: string;
        proxy: string;
        "tls-port": number;
        type: string;
        ca: string;
        "host-subject": string;
        "toggle-fullscreen"?: string;
        "release-cursor"?: string;
        "secure-attention"?: string;
        "delete-this-file"?: number;
        title?: string;
    };
}

/**
 * Get the VNC websocket URL for connecting noVNC.
 */
export function getVncWebsocketUrl(node: string, vmId: string, port: number, ticket: string, vmType: "qemu" | "lxc" = "qemu") {
    const encodedTicket = encodeURIComponent(ticket);
    return `wss://${PVE_HOST}:${PVE_PORT}/api2/json/nodes/${node}/${vmType}/${vmId}/vncwebsocket?port=${port}&vncticket=${encodedTicket}`;
}

/**
 * Start a VM
 */
export async function startVM(node: string, vmId: string, vmType: "qemu" | "lxc" = "qemu") {
    return pveFetch(`/nodes/${node}/${vmType}/${vmId}/status/start`, { method: "POST" });
}

/**
 * Stop a VM
 */
export async function stopVM(node: string, vmId: string, vmType: "qemu" | "lxc" = "qemu") {
    return pveFetch(`/nodes/${node}/${vmType}/${vmId}/status/stop`, { method: "POST" });
}

/**
 * Restart (reboot) a VM
 */
export async function restartVM(node: string, vmId: string, vmType: "qemu" | "lxc" = "qemu") {
    return pveFetch(`/nodes/${node}/${vmType}/${vmId}/status/reboot`, { method: "POST" });
}

/**
 * Get current VM status from Proxmox VE directly
 */
export async function getVMStatus(node: string, vmId: string, vmType: "qemu" | "lxc" = "qemu") {
    return pveFetch(`/nodes/${node}/${vmType}/${vmId}/status/current`);
}

/**
 * Change the boot ISO (CD-ROM) for a VM — used for OS reinstall
 */
export async function changeVMIso(node: string, vmId: string, isoPath: string) {
    return pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify({ ide2: `${isoPath},media=cdrom` }),
    });
}

/**
 * Destroy (delete) a VM and all its disks.
 * Stops the VM first if it's running.
 */
export async function destroyVM(node: string, vmId: string, vmType: "qemu" | "lxc" = "qemu") {
    try {
        // Stop first (ignore errors if already stopped)
        await pveFetch(`/nodes/${node}/${vmType}/${vmId}/status/stop`, { method: "POST" });
        await new Promise((r) => setTimeout(r, 3000)); // brief wait for shutdown
    } catch { /* already stopped */ }
    return pveFetch(`/nodes/${node}/${vmType}/${vmId}?purge=1&destroy-unreferenced-disks=1`, {
        method: "DELETE",
    });
}

// ─── Phase 2: Orchestration Helpers ─────────────────────────────

export interface StoragePool {
    storage: string;
    node: string;
    content: string;
    avail: number;
    used: number;
    total: number;
    type: string;
    active: number;
    enabled: number;
}

/**
 * Get all storage pools on a specific node.
 * Filters to pools that can hold VM images (content includes "images").
 */
export async function getNodeStorage(node: string): Promise<StoragePool[]> {
    const data = await pveFetch(`/nodes/${node}/storage?content=images`);
    return (data as StoragePool[]).map((s) => ({ ...s, node }));
}

/**
 * Fetch storage from all available nodes and collate into one flat list.
 */
export async function getAllNodesStorage(): Promise<StoragePool[]> {
    try {
        const nodesRaw = await pveFetch("/nodes");
        const nodes: string[] = (nodesRaw as { node: string }[]).map((n) => n.node);
        const results = await Promise.allSettled(nodes.map((n) => getNodeStorage(n)));
        return results
            .filter((r): r is PromiseFulfilledResult<StoragePool[]> => r.status === "fulfilled")
            .flatMap((r) => r.value);
    } catch {
        return [];
    }
}

/**
 * From a list of storage pools, pick the node+storage combination with
 * the most available space, filtered by a keyword in the storage name.
 * Falls back to any pool if no keyword match found.
 */
export function selectBestStorage(
    pools: StoragePool[],
    keyword: string
): { node: string; storage: string } | null {
    if (pools.length === 0) return null;

    const kw = keyword.toLowerCase();
    const filtered = pools.filter((p) =>
        p.storage.toLowerCase().includes(kw) && p.active === 1 && p.enabled === 1 && p.avail > 0
    );

    const candidates = filtered.length > 0 ? filtered : pools.filter((p) => p.active === 1 && p.enabled === 1);
    candidates.sort((a, b) => b.avail - a.avail);

    if (candidates.length === 0) return null;
    return { node: candidates[0].node, storage: candidates[0].storage };
}

/**
 * Get the next available VM ID from the Proxmox cluster.
 */
export async function getNextVmId(): Promise<number> {
    const data = await pveFetch("/cluster/nextid");
    return parseInt(data as string, 10);
}

/**
 * Create a new QEMU VM on the given node.
 */
export async function createVM(node: string, config: Record<string, string | number | boolean>) {
    return pveFetch(`/nodes/${node}/qemu`, {
        method: "POST",
        body: JSON.stringify(config),
    });
}

/**
 * Update VM config via PUT (for disk/ISO changes).
 */
export async function updateVMConfig(node: string, vmId: string, config: Record<string, string | number | boolean>) {
    return pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify(config),
    });
}

/**
 * Detach and permanently delete a disk from a VM.
 * Step 1: Remove the disk from config (sets it to "unused:X").
 * Step 2: Delete the unused disk to free the storage.
 */
export async function detachAndDeleteDisk(node: string, vmId: string, disk = "scsi0") {
    // Step 1: detach by setting delete flag
    await pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify({ delete: disk }),
    });
    // Brief pause to let Proxmox process the detach before further ops
    await new Promise((r) => setTimeout(r, 1500));
}

/**
 * Allocate a fresh blank disk on scsi0 for a VM.
 * Example: addDisk("Timox-1", "150", "local-zfs", 32)
 */
export async function addDisk(node: string, vmId: string, storage: string, diskGb: number) {
    return pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify({ scsi0: `${storage}:${diskGb}` }),
    });
}

/**
 * Set the VM boot order to prefer CD-ROM then disk.
 * This ensures the VM boots into the ISO installer on first start.
 */
export async function setBootOrder(node: string, vmId: string) {
    return pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify({ boot: "order=ide2;scsi0" }),
    });
}

/**
 * Generate a random MAC address in Proxmox format (lowercase hex pairs).
 */
export function generateMac(): string {
    const hex = () => Math.floor(Math.random() * 16).toString(16).padStart(2, "0");
    // First byte: locally administered, unicast (02:xx:...)
    return `02:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
}

