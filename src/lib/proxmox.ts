/**
 * Proxmox API Client
 *
 * Centralized HTTP client for communicating with:
 * 1. Proxmox Manager API (proxmox-renting-upkeep) — VM tracking, pricing, rentals
 * 2. Proxmox VE API — Direct VNC ticket, VM lifecycle & provisioning
 */

// ─── Shared Types ─────────────────────────────────────────────────

export interface CloudInitConfig {
    /** e.g. "ip=10.0.1.50/24,gw=10.0.1.1" or "ip=dhcp" */
    ipConfig: string;
    /** Linux user to create inside the VM */
    ciUser?: string;
    /** Password for the Cloud-Init user */
    ciPassword?: string;
    /** Public SSH key(s) — newline separated. URL-encoded when sent to PVE. */
    sshKey?: string;
    /** Optional: cloud-init nameservers e.g. "1.1.1.1 8.8.8.8" */
    nameserver?: string;
    /** Optional: search domain e.g. "example.com" */
    searchdomain?: string;
}

export interface ClusterVMResource {
    vmid: number;
    name: string;
    node: string;
    type: "qemu" | "lxc";
    status: "running" | "stopped" | "paused" | string;
    /** fraction of allocated vCPU capacity currently used (0–1) */
    cpu: number;
    cpuPercent: string;
    /** number of allocated vCPUs */
    maxcpu: number;
    /** bytes of RAM currently consumed */
    mem: number;
    /** bytes of RAM allocated */
    maxmem: number;
    ramPercent: string;
    /** bytes of disk currently used */
    disk: number;
    /** bytes of disk allocated */
    maxdisk: number;
    diskPercent: string;
    /** uptime in seconds (0 if stopped) */
    uptime: number;
    /** true when this VM is a template */
    template: boolean;
}

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

// ─── Proxmox VE Direct API ───────────────────────────────────────

const PVE_HOST = process.env.PROXMOX_VE_HOST || "";
const PVE_PORT = process.env.PROXMOX_VE_PORT || "";
const PVE_TOKEN_ID = process.env.PROXMOX_VE_TOKEN_ID || "";
const PVE_TOKEN_VALUE = process.env.PROXMOX_VE_TOKEN_VALUE || "";

const PVE_BASE = `https://${PVE_HOST}:${PVE_PORT}/api2/json`;

// Define a safe fetch wrapper for Next.js
async function pveFetch(endpoint: string, options: RequestInit = {}) {
    if (!PVE_HOST || !PVE_PORT) throw new Error("PROXMOX_VE_HOST/PORT not configured in .env.local");
    const url = `${PVE_BASE}${endpoint}`;

    // We set this explicitly in the API scope so Node's native fetch allows IP testing
    // against self-signed certs (e.g. stormtrooper.notrespond.com vs 10.0.1.1)
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    // Only send Content-Type: application/json when there is actually a request body.
    // Sending this header with NO body causes PVE's Perl JSON parser to throw:
    //   "malformed JSON string at character 0 (before (end of string))" → HTTP 500
    const headers: Record<string, string> = {
        "Authorization": `PVEAPIToken=${PVE_TOKEN_ID}=${PVE_TOKEN_VALUE}`,
        ...(options.headers as Record<string, string> | undefined),
    };
    if (options.body) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(`Proxmox VE ${res.status}: ${text}`);
    }

    // PVE action endpoints (start/stop/restart/delete) return an empty body on success.
    // Calling res.json() on an empty body causes a second malformed JSON error on our side.
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text().catch(() => "");
    if (!text.trim()) return null;

    if (contentType.includes("application/json")) {
        try {
            const json = JSON.parse(text);
            return json?.data ?? json ?? null;
        } catch {
            return null;
        }
    }

    return null;
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

// ─── Admin: VM Creation & Discovery ──────────────────────────────

/**
 * Get the next available VMID from the Proxmox cluster
 */
export async function getNextVMID() {
    return pveFetch("/cluster/nextid");
}

/**
 * List all nodes in the Proxmox cluster
 */
export async function listPVENodes() {
    return pveFetch("/nodes");
}

/**
 * List ISO images available on a node's storage
 */
export async function listISOs(node: string, storage: string = "local") {
    return pveFetch(`/nodes/${node}/storage/${storage}/content?content=iso`);
}

/**
 * List storages available on a node
 */
export async function listStorages(node: string) {
    return pveFetch(`/nodes/${node}/storage`);
}

/**
 * Create a new QEMU VM on a Proxmox node
 */
export async function createVM(node: string, config: {
    vmid: number;
    name: string;
    memory: number; // in MB
    cores: number;
    sockets?: number;
    cpu?: string;
    ostype?: string;
    scsihw?: string;
    scsi0?: string; // disk config, e.g. "local-lvm:32,format=raw"
    ide2?: string; // ISO, e.g. "local:iso/Win11.iso,media=cdrom"
    net0?: string; // network, e.g. "virtio,bridge=vmbr0"
    boot?: string;
    bios?: string;
    machine?: string;
    efidisk0?: string;
    tpmstate0?: string;
    agent?: string;
    [key: string]: unknown;
}) {
    return pveFetch(`/nodes/${node}/qemu`, {
        method: "POST",
        body: JSON.stringify(config),
    });
}

/**
 * List all QEMU VMs on a node (admin discovery)
 */
export async function listNodeVMs(node: string) {
    return pveFetch(`/nodes/${node}/qemu`);
}

/**
 * Delete (destroy) a QEMU VM from Proxmox VE.
 * The VM should be stopped before calling this.
 * PVE returns an empty body on success — handled by pveFetch.
 *
 * @param node   - Proxmox node name
 * @param vmId   - VMID of the VM to delete
 * @param purge  - true = also remove from replication jobs and pending config
 */
export async function deleteVM(
    node: string,
    vmId: number | string,
    purge = true,
): Promise<void> {
    const qs = purge ? "?purge=1&destroy-unreferenced-disks=1" : "";
    await pveFetch(`/nodes/${node}/qemu/${vmId}${qs}`, { method: "DELETE" });
}

// ─── Admin: VPS Provisioning Pipeline ────────────────────────────

/**
 * Clone a template VM into a new VM.
 * Returns the Proxmox UPID string that tracks the async clone task.
 *
 * @param node       - Proxmox node name (e.g. "pve1")
 * @param templateId - VMID of the template to clone
 * @param newVmId    - VMID to assign to the clone (use getNextVMID())
 * @param name       - Friendly name for the new VM
 * @param storage    - Target storage pool (e.g. "local-lvm")
 * @param full       - true = full clone (independent disk), false = linked clone
 */
export async function cloneVM(
    node: string,
    templateId: number,
    newVmId: number,
    name: string,
    storage: string,
    full = true,
): Promise<string> {
    // Proxmox returns the UPID as a bare string (not wrapped in .data)
    const upid = await pveFetch(`/nodes/${node}/qemu/${templateId}/clone`, {
        method: "POST",
        body: JSON.stringify({
            newid: newVmId,
            name,
            target: node,
            storage,
            full: full ? 1 : 0,
        }),
    });
    return upid as string;
}

/**
 * Apply Cloud-Init parameters to a cloned VM's config.
 * Must be called AFTER the clone UPID has resolved successfully.
 *
 * @param node   - Proxmox node name
 * @param vmId   - Target VM ID
 * @param config - Cloud-Init parameters (IP, user, password, SSH key)
 */
export async function setCloudInit(
    node: string,
    vmId: number | string,
    config: CloudInitConfig,
): Promise<void> {
    const body: Record<string, string> = {
        ipconfig0: config.ipConfig,
    };

    if (config.ciUser) body.ciuser = config.ciUser;
    if (config.ciPassword) body.cipassword = config.ciPassword;
    if (config.nameserver) body.nameserver = config.nameserver;
    if (config.searchdomain) body.searchdomain = config.searchdomain;

    // PVE requires SSH keys to be URL-encoded
    if (config.sshKey) {
        body.sshkeys = encodeURIComponent(config.sshKey.trim());
    }

    await pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

/**
 * Poll a Proxmox UPID until the task completes or times out.
 *
 * Proxmox operations (clone, resize, snapshot, …) are asynchronous —
 * they return a UPID string immediately. This function polls the task
 * status endpoint at `intervalMs` intervals until:
 *   - exitstatus === "OK"  → resolves
 *   - exitstatus is set but !== "OK" → rejects with the error message
 *   - `timeoutMs` elapses without completion → rejects with timeout error
 *
 * @param node       - Proxmox node that owns the task
 * @param upid       - UPID string returned by cloneVM / other PVE calls
 * @param timeoutMs  - Maximum wait time in ms (default 120 000 = 2 min)
 * @param intervalMs - Polling interval in ms (default 2 000 = 2 s)
 */
export async function pollTask(
    node: string,
    upid: string,
    timeoutMs = 120_000,
    intervalMs = 2_000,
): Promise<void> {
    const encodedUpid = encodeURIComponent(upid);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const status = await pveFetch(`/nodes/${node}/tasks/${encodedUpid}/status`) as {
            status: string;
            exitstatus?: string;
        };

        if (status.status === "stopped") {
            if (status.exitstatus === "OK") {
                return; // ✅ Task completed successfully
            }
            throw new Error(
                `Proxmox task ${upid} failed: exitstatus = "${status.exitstatus}"`
            );
        }

        // Task still running — wait before next poll
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
        `Proxmox task ${upid} timed out after ${timeoutMs / 1000}s`
    );
}

/**
 * Fetch all VMs/LXC containers from the entire cluster with live resource usage.
 * Uses the cluster aggregator endpoint — no per-node loop required.
 *
 * Returns an array of ClusterVMResource objects, sorted by node then vmid.
 * Templates are included (filter client-side if needed).
 */
export async function getClusterResources(): Promise<ClusterVMResource[]> {
    const raw = await pveFetch("/cluster/resources?type=vm") as Array<Record<string, unknown>>;

    return raw
        .map((vm): ClusterVMResource => {
            const cpu = (vm.cpu as number) ?? 0;
            const mem = (vm.mem as number) ?? 0;
            const maxmem = (vm.maxmem as number) ?? 1; // avoid /0
            const disk = (vm.disk as number) ?? 0;
            const maxdisk = (vm.maxdisk as number) ?? 1;

            return {
                vmid: (vm.vmid as number),
                name: (vm.name as string) ?? `vm-${vm.vmid}`,
                node: (vm.node as string),
                type: (vm.type as "qemu" | "lxc"),
                status: (vm.status as string),
                cpu,
                cpuPercent: `${(cpu * 100).toFixed(1)}%`,
                maxcpu: (vm.maxcpu as number) ?? 1,
                mem,
                maxmem: (vm.maxmem as number),
                ramPercent: `${((mem / maxmem) * 100).toFixed(1)}%`,
                disk,
                maxdisk: (vm.maxdisk as number),
                diskPercent: `${((disk / maxdisk) * 100).toFixed(1)}%`,
                uptime: (vm.uptime as number) ?? 0,
                template: Boolean(vm.template),
            };
        })
        .sort((a, b) =>
            a.node.localeCompare(b.node) || a.vmid - b.vmid
        );
}
