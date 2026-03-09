/**
 * Proxmox API Client
 * 
 * Centralized HTTP client for communicating with:
 * 1. Proxmox Manager API (proxmox-renting-upkeep) — VM tracking, pricing, rentals
 * 2. Proxmox VE API — Direct VNC ticket generation
 */

// ─── Manager API Client ──────────────────────────────────────────

const MANAGER_URL = process.env.PROXMOX_MANAGER_URL || "";
const MANAGER_API_KEY = process.env.PROXMOX_API_KEY || "";

async function managerFetch(endpoint: string, options: RequestInit = {}) {
    if (!MANAGER_URL) throw new Error("PROXMOX_MANAGER_URL is not configured in the server");
    const url = `${MANAGER_URL}${endpoint}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": MANAGER_API_KEY,
            ...options.headers,
        },
        // Allow self-signed certs in Node.js
        // @ts-expect-error -- Node.js fetch option
        rejectUnauthorized: false,
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

import https from 'https';

// ─── Proxmox VE Direct API ───────────────────────────────────────

const PVE_HOST = process.env.PROXMOX_VE_HOST || "";
const PVE_PORT = process.env.PROXMOX_VE_PORT || "";
const PVE_TOKEN_ID = process.env.PROXMOX_VE_TOKEN_ID || "";
const PVE_TOKEN_VALUE = process.env.PROXMOX_VE_TOKEN_VALUE || "";

const PVE_BASE = `https://${PVE_HOST}:${PVE_PORT}/api2/json`;

// Create an HTTPS agent that ignores SSL certificate errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

async function pveFetch(endpoint: string, options: RequestInit = {}) {
    if (!PVE_HOST || !PVE_PORT) throw new Error("PROXMOX_VE_HOST/PORT not configured in .env.local");
    const url = `${PVE_BASE}${endpoint}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            "Authorization": `PVEAPIToken=${PVE_TOKEN_ID}=${PVE_TOKEN_VALUE}`,
            "Content-Type": "application/json",
            ...options.headers,
        },
        dispatcher: httpsAgent,
    } as RequestInit);

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
        body: JSON.stringify({ websocket: 1 }),
    });
    return {
        ticket: data.ticket as string,
        port: data.port as number,
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
