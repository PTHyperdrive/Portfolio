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

export async function pveFetch(endpoint: string, options: RequestInit = {}) {
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
    // Return only the path — the frontend prepends wss:// + window.location.host
    // so the URL is domain-agnostic (works with any domain/proxy).
    return `/novnc/api2/json/nodes/${node}/${vmType}/${vmId}/vncwebsocket?port=${port}&vncticket=${encodedTicket}`;
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
 * Inject an SSH public key into a VM via cloud-init.
 *
 * Proxmox requires the key to be URL-encoded when passed through the API.
 * Multiple keys can be joined with newlines before encoding.
 *
 * @param node      - Proxmox node name
 * @param vmId      - VM ID string
 * @param publicKey - One SSH public key string (or newline-joined set)
 */
export async function injectSshKey(node: string, vmId: string, publicKey: string) {
    // Proxmox cloud-init requires URL-encoded keys
    const encoded = encodeURIComponent(publicKey.trim());
    return pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify({ sshkeys: encoded }),
    });
}

/**
 * Regenerate the cloud-init drive image after config changes.
 * Call this after injectSshKey() for changes to take effect on next boot.
 */
export async function triggerCloudInitRegen(node: string, vmId: string) {
    return pveFetch(`/nodes/${node}/qemu/${vmId}/cloudinit`, {
        method: "PUT",
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
 *
 * @param strict - When true, returns null instead of falling back to any
 *   pool if no keyword match is found. Use this for paid plans where the
 *   pool type (e.g. NVMe vs HDD) is a billing requirement.
 */
export function selectBestStorage(
    pools: StoragePool[],
    keyword: string,
    strict = false
): { node: string; storage: string } | null {
    if (pools.length === 0) return null;

    const kw = keyword.toLowerCase();
    const filtered = pools.filter((p) =>
        p.storage.toLowerCase().includes(kw) && p.active === 1 && p.enabled === 1 && p.avail > 0
    );

    // strict = true: no keyword match → fail fast (prevents billing mismatch)
    if (filtered.length === 0 && strict) return null;

    const candidates = filtered.length > 0
        ? filtered
        : pools.filter((p) => p.active === 1 && p.enabled === 1 && p.avail > 0);
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
 * Read the current configuration of a VM.
 * Returns the raw Proxmox config object (disk slots, cpu, memory, etc.)
 */
export async function getVMConfig(node: string, vmId: string): Promise<Record<string, string>> {
    return pveFetch(`/nodes/${node}/qemu/${vmId}/config`) as Promise<Record<string, string>>;
}

/**
 * Wait until the VM reports status "stopped", with a timeout.
 *
 * Uses exponential backoff with jitter instead of a fixed poll interval:
 *   - Starts at 1 s, doubles each round, caps at 16 s.
 *   - ±250 ms jitter prevents thundering-herd across concurrent reinstall requests.
 *   - Under load this reduces Proxmox API call rate by ~4–8× vs the legacy
 *     fixed-2 s loop, avoiding pvedaemon rate-limiting.
 *
 * This is a server-side blocking guard — never call from a browser.
 * The VM must be stopped before any destructive disk operations.
 *
 * @param node      - Proxmox node name
 * @param vmId      - VMID string
 * @param timeoutMs - Maximum wait time in ms (default 60 s)
 */
export async function waitForVMStopped(
    node: string,
    vmId: string,
    timeoutMs = 60_000
): Promise<void> {
    const deadline  = Date.now() + timeoutMs;
    const maxDelay  = 16_000;
    const jitter    = () => Math.random() * 500 - 250; // ±250 ms
    let   delay     = 1_000; // start at 1 s

    while (Date.now() < deadline) {
        const status = await pveFetch(
            `/nodes/${node}/qemu/${vmId}/status/current`
        ) as { status: string };
        if (status.status === "stopped") return;

        // Clamp wait so we never overshoot the deadline
        const remaining = deadline - Date.now();
        const wait = Math.min(delay, remaining, maxDelay) + jitter();
        if (wait <= 0) break;

        await new Promise((r) => setTimeout(r, wait));
        delay = Math.min(delay * 2, maxDelay);
    }

    throw new Error(`VM ${vmId} on ${node} did not stop within ${timeoutMs / 1000}s`);
}

/**
 * Detach and **permanently delete** a disk volume from a VM.
 *
 * The naive approach (setting `delete: "scsi0"` in the VM config) only
 * detaches the disk from the VM config — it leaves an "Unused disk" entry
 * in Proxmox storage, causing a storage leak over time.
 *
 * This function:
 *   1. Reads the current VM config to find the exact volume identifier
 *      (e.g. `local-zfs:vm-150-disk-0`) attached to the specified slot.
 *   2. Removes the disk from the VM config via `delete`.
 *   3. Calls `DELETE /nodes/{node}/storage/{storageId}/content/{volumeId}`
 *      to fully destroy the volume from the storage pool.
 *
 * @param node  - Proxmox node name
 * @param vmId  - VM ID string
 * @param disk  - Config slot to target (default: "scsi0")
 */
export async function detachAndDeleteDisk(
    node: string,
    vmId: string,
    disk = "scsi0"
): Promise<void> {
    // ── 1. Read current VM config to find the volume name ────────────
    const config = await pveFetch(`/nodes/${node}/qemu/${vmId}/config`) as Record<string, string>;
    const rawDiskValue = config[disk]; // e.g. "local-zfs:vm-150-disk-0,size=32G" or undefined

    // ── 2. Detach from VM config ──────────────────────────────────────
    // Using `delete` removes the slot from the VM config.
    // The volume may briefly appear as "unusedN" — we delete it next.
    await pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify({ delete: disk }),
    });

    // Brief pause for Proxmox to process the detach
    await new Promise((r) => setTimeout(r, 1_500));

    // ── 3. Destroy the volume from storage ───────────────────────────
    if (rawDiskValue) {
        // rawDiskValue format: "<storage>:<volume>[,options]"
        // e.g. "local-zfs:vm-150-disk-0,size=32G"
        const volumeWithOptions = rawDiskValue.split(",")[0]; // "local-zfs:vm-150-disk-0"
        const colonIdx = volumeWithOptions.indexOf(":");

        if (colonIdx !== -1) {
            const storageId = volumeWithOptions.slice(0, colonIdx);   // "local-zfs"
            const volumeId  = volumeWithOptions.slice(colonIdx + 1);  // "vm-150-disk-0"

            try {
                // Encode the volume ID — some pools use slashes (e.g. ceph/vm-150-disk-0)
                const encodedVolume = encodeURIComponent(volumeId);
                await pveFetch(
                    `/nodes/${node}/storage/${storageId}/content/${encodedVolume}`,
                    { method: "DELETE" }
                );
            } catch (err) {
                // Non-fatal: log and continue. Volume may already be gone
                // or Proxmox auto-cleaned it. Do not abort the reinstall.
                console.warn(
                    `[detachAndDeleteDisk] Could not delete volume ${volumeId} ` +
                    `from ${storageId} — it may have been auto-cleaned:`,
                    err
                );
            }
        }
    }
}

/**
 * Allocate a fresh blank disk on sata0 for a VM.
 *
 * SATA (AHCI) is used instead of VirtIO SCSI because it works
 * out of the box on all mainstream OSes (Windows, Linux, BSD)
 * without requiring manual driver injection.
 *
 * Example: addDisk("Timox-1", "150", "local-zfs", 32)
 */
export async function addDisk(node: string, vmId: string, storage: string, diskGb: number) {
    return pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify({ sata0: `${storage}:${diskGb}` }),
    });
}

/**
 * Set the VM boot order to: SATA disk first, then CD-ROM.
 *
 * Updated from the legacy "order=ide2;scsi0" to "order=sata0;ide2"
 * to match the SATA bus migration.
 */
export async function setBootOrder(node: string, vmId: string) {
    return pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify({ boot: "order=sata0;ide2" }),
    });
}

/**
 * Detect the primary OS disk slot on an existing VM.
 *
 * Older VMs may have been provisioned on scsi0 or virtio0; newer ones
 * use sata0. This function inspects the live config and returns the
 * first occupied slot from the candidate list, so the reinstall API
 * can destroy the correct volume regardless of bus type.
 *
 * @returns The config key (e.g. "sata0", "scsi0") or null if not found.
 */
export async function detectPrimaryDisk(
    node: string,
    vmId: string
): Promise<string | null> {
    const config = await pveFetch(`/nodes/${node}/qemu/${vmId}/config`) as Record<string, string>;
    const candidates = ["sata0", "scsi0", "virtio0", "ide0"] as const;
    for (const slot of candidates) {
        if (config[slot]) return slot;
    }
    return null;
}

/**
 * Generate a random MAC address in Proxmox format (lowercase hex pairs).
 */
export function generateMac(): string {
    const hex = () => Math.floor(Math.random() * 16).toString(16).padStart(2, "0");
    // First byte: locally administered, unicast (02:xx:...)
    return `02:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
}

// ── Snapshots ────────────────────────────────────────────────────────────────

export interface VmSnapshot {
    name:        string;
    description: string;
    snaptime:    number;
    vmstate:     number; // 1 = includes RAM state
    parent?:     string;
}

/**
 * List all snapshots for a VM.
 * Excludes the virtual "current" pseudo-snapshot Proxmox always returns.
 */
export async function listSnapshots(node: string, vmId: string): Promise<VmSnapshot[]> {
    const data = await pveFetch(`/nodes/${node}/qemu/${vmId}/snapshot`);
    return ((data as VmSnapshot[]) ?? []).filter((s) => s.name !== "current");
}

/**
 * Create a snapshot.
 * @param snapname    - Alphanumeric snapshot name (no spaces; max 40 chars)
 * @param description - Human-readable description stored with the snapshot
 * @param includeRam  - If true, captures live RAM state (VM keeps running but creates larger snapshot)
 */
export async function createSnapshot(
    node:        string,
    vmId:        string,
    snapname:    string,
    description: string,
    includeRam = false
): Promise<string> {
    // Proxmox returns a task UPID string
    const upid = await pveFetch(`/nodes/${node}/qemu/${vmId}/snapshot`, {
        method: "POST",
        body: JSON.stringify({
            snapname,
            description,
            ...(includeRam ? { vmstate: 1 } : {}),
        }),
    });
    return upid as string;
}

/**
 * Delete a snapshot by name.
 * @param force - If true, also removes associated disk changes (removes all child snapshots)
 */
export async function deleteSnapshot(
    node:     string,
    vmId:     string,
    snapname: string,
    force = false
): Promise<string> {
    const upid = await pveFetch(`/nodes/${node}/qemu/${vmId}/snapshot/${snapname}`, {
        method: "DELETE",
        body: JSON.stringify({ force: force ? 1 : 0 }),
    });
    return upid as string;
}

/**
 * Roll back a VM to a snapshot.
 * ⚠ This will stop the VM if it is running.
 */
export async function rollbackSnapshot(
    node:     string,
    vmId:     string,
    snapname: string
): Promise<string> {
    const upid = await pveFetch(`/nodes/${node}/qemu/${vmId}/snapshot/${snapname}/rollback`, {
        method: "POST",
        body: JSON.stringify({}),
    });
    return upid as string;
}

// ── Backups ──────────────────────────────────────────────────────────────────

export interface BackupJob {
    upid:      string;
    starttime: number;
    status:    string;
    volid?:    string;  // resulting archive volume ID
    size?:     number;  // bytes
}

/**
 * Trigger a live block-level backup of a VM.
 *
 * Business rules (enforced, not configurable):
 *   - mode: snapshot  → VM keeps running during backup (no downtime)
 *   - compress: zstd  → best speed/size ratio
 *   - remove: 0       → keep existing backups (retention managed separately)
 *
 * @param storage - Proxmox storage ID that can hold backups (type: dir or btrfs with max-protected-backups)
 */
export async function createBackup(
    node:    string,
    vmId:    string,
    storage: string,
    notes?:  string
): Promise<string> {
    const upid = await pveFetch(`/nodes/${node}/vzdump`, {
        method: "POST",
        body: JSON.stringify({
            vmid:     vmId,
            storage,
            mode:     "snapshot",   // ENFORCED: no downtime
            compress: "zstd",       // ENFORCED: storage optimization
            remove:   0,            // keep all backups
            ...(notes ? { "notes-template": notes } : {}),
        }),
    });
    return upid as string;
}

/**
 * List backups stored on a given storage that belong to a specific VM.
 */
export async function listBackups(
    node:    string,
    storage: string,
    vmId?:   string
): Promise<{ volid: string; ctime: number; size: number; notes?: string; vmid?: string }[]> {
    const data = await pveFetch(`/nodes/${node}/storage/${storage}/content?content=backup`);
    const all  = data as { volid: string; ctime: number; size: number; notes?: string; vmid?: string }[];
    return vmId ? all.filter((b) => String(b.vmid) === String(vmId)) : all;
}

/**
 * Delete a backup archive from storage.
 * @param volid - Full volume ID, e.g. "backups:backup/vzdump-qemu-150-2024_01_01.vma.zst"
 */
export async function deleteBackup(
    node:  string,
    volid: string
): Promise<string> {
    const [storageId, volumePath] = volid.split(":");
    const encoded = encodeURIComponent(volumePath ?? volid);
    const upid = await pveFetch(`/nodes/${node}/storage/${storageId}/content/${encoded}`, {
        method: "DELETE",
    });
    return upid as string;
}

/**
 * Poll a Proxmox task UPID until it completes or times out.
 * Returns the exitstatus string ("OK" on success).
 *
 * Uses exponential backoff with jitter instead of a fixed poll interval:
 *   - Starts at 1 s, doubles each round, caps at 16 s.
 *   - ±250 ms jitter spreads concurrent backup/snapshot task watchers.
 *   - The legacy fixed-3 s `intervalMs` parameter has been removed;
 *     callers that previously customised the interval should rely on
 *     `timeoutMs` to control the maximum wait window instead.
 *
 * @param node      - Proxmox node name
 * @param upid      - Task UPID string returned by snapshot/backup/Task APIs
 * @param timeoutMs - Maximum wait time in ms (default 300 s / 5 min)
 */
export async function waitForTask(
    node:       string,
    upid:       string,
    timeoutMs = 300_000
): Promise<string> {
    const deadline  = Date.now() + timeoutMs;
    const maxDelay  = 16_000;
    const jitter    = () => Math.random() * 500 - 250; // ±250 ms
    let   delay     = 1_000; // start at 1 s

    while (Date.now() < deadline) {
        const status = await pveFetch(
            `/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`
        ) as { status: string; exitstatus?: string };

        if (status.status === "stopped") return status.exitstatus ?? "OK";

        // Clamp wait so we never overshoot the deadline
        const remaining = deadline - Date.now();
        const wait = Math.min(delay, remaining, maxDelay) + jitter();
        if (wait <= 0) break;

        await new Promise((r) => setTimeout(r, wait));
        delay = Math.min(delay * 2, maxDelay);
    }

    throw new Error(`Task ${upid} timed out after ${timeoutMs / 1000}s`);
}

// ── Cloud-Init Provisioning ──────────────────────────────────────────────────

/**
 * Clone a VM template to create a new VM.
 *
 * The template must already exist on the target node as a Proxmox template
 * (created via `qm template <vmid>`). Templates follow the naming convention
 * defined in `src/config/templates.ts`: '{OS}-{Version}-{GPUstate}'.
 *
 * Resolution priority:
 *   1. If `knownTemplateVmid` is provided, use it directly (O(1), no API call)
 *   2. Otherwise, search by name via `findTemplateVmid()` (API round-trip)
 *
 * @param node              - Target Proxmox node
 * @param templateName      - Proxmox template name (e.g. "UBUNTU-2404-NoGPU")
 * @param newVmid           - VMID for the new cloned VM
 * @param newName           - Hostname / VM name
 * @param targetStorage     - Storage pool for the cloned disk (e.g. "local-lvm")
 * @param full              - true = full (independent) clone, false = linked clone
 * @param knownTemplateVmid - Hardcoded VMID from template registry (optional)
 * @returns UPID string from the clone task
 */
export async function cloneTemplate(
    node: string,
    templateName: string,
    newVmid: number,
    newName: string,
    targetStorage: string,
    full = true,
    knownTemplateVmid?: number | null
): Promise<string> {
    // Step 1: Resolve the template VMID
    //   Fast path: use hardcoded VMID from template registry
    //   Slow path: search all VMs on the node by name
    const templateVmid = knownTemplateVmid ?? await findTemplateVmid(node, templateName);
    if (!templateVmid) {
        throw new Error(
            `Template "${templateName}" not found on node "${node}". ` +
            `Ensure the template VM exists and has been converted via 'qm template'.`
        );
    }

    // Step 2: Clone the template
    const upid = await pveFetch(`/nodes/${node}/qemu/${templateVmid}/clone`, {
        method: "POST",
        body: JSON.stringify({
            newid:   newVmid,
            name:    newName,
            target:  node,
            storage: targetStorage,
            full:    full ? 1 : 0,
        }),
    });

    return upid as string;
}

/**
 * Find a template VM's VMID by its name on a given node.
 *
 * Searches all QEMU VMs on the node for one matching the name
 * and having `template: 1` set.
 *
 * @returns VMID number or null if not found
 */
export async function findTemplateVmid(
    node: string,
    templateName: string
): Promise<number | null> {
    const vms = await pveFetch(`/nodes/${node}/qemu`) as {
        vmid: number;
        name?: string;
        template?: number;
    }[];

    const match = vms.find(
        (vm) => vm.name === templateName && vm.template === 1
    );

    return match?.vmid ?? null;
}

/**
 * Resize a VM's disk after cloning.
 *
 * Cloud-Init template images are typically small (2–10 GB). After cloning,
 * the disk must be expanded to match the plan's allocated disk size.
 *
 * @param node   - Proxmox node
 * @param vmId   - VMID string
 * @param disk   - Disk slot to resize (e.g. "scsi0")
 * @param sizeGb - Target size in GB (absolute, not delta)
 */
export async function resizeDisk(
    node: string,
    vmId: string,
    disk: string,
    sizeGb: number
): Promise<void> {
    await pveFetch(`/nodes/${node}/qemu/${vmId}/resize`, {
        method: "PUT",
        body: JSON.stringify({ disk, size: `${sizeGb}G` }),
    });
}

/**
 * Configure Cloud-Init parameters on a VM.
 *
 * Sets user account, SSH keys, IP config, DNS, and hostname via
 * the Proxmox Cloud-Init API. Changes are written to the Cloud-Init
 * drive and applied on next boot.
 *
 * For Windows VMs (Cloudbase-Init), use citype=configdrive2 and set
 * the ostype to the appropriate Windows version beforehand.
 *
 * @param node   - Proxmox node
 * @param vmId   - VMID string
 * @param config - Cloud-Init configuration parameters
 */
export async function setCloudInitConfig(
    node: string,
    vmId: string,
    config: {
        /** Default SSH user (e.g. "ubuntu", "Admin") */
        ciuser?: string;
        /** Password for the CI user (hashed; optional) */
        cipassword?: string;
        /** SSH public keys (newline-separated, URL-encoded) */
        sshkeys?: string;
        /** IP config for net0 (e.g. "ip=dhcp" or "ip=10.0.10.5/24,gw=10.0.10.1") */
        ipconfig0?: string;
        /** DNS nameserver(s), space-separated */
        nameserver?: string;
        /** DNS search domain */
        searchdomain?: string;
    }
): Promise<void> {
    // Build only the defined fields — Proxmox ignores undefined/null
    const payload: Record<string, string> = {};
    if (config.ciuser)        payload.ciuser       = config.ciuser;
    if (config.cipassword)    payload.cipassword   = config.cipassword;
    if (config.sshkeys)       payload.sshkeys      = config.sshkeys;
    if (config.ipconfig0)     payload.ipconfig0    = config.ipconfig0;
    if (config.nameserver)    payload.nameserver   = config.nameserver;
    if (config.searchdomain)  payload.searchdomain = config.searchdomain;

    if (Object.keys(payload).length === 0) return;

    await pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/**
 * Adjust VM hardware specs (CPU, memory, bandwidth) after cloning.
 *
 * Templates are created with minimal resources. After cloning, the VM's
 * hardware must be scaled to match the selected plan configuration.
 *
 * @param node   - Proxmox node
 * @param vmId   - VMID string
 * @param specs  - Hardware specifications from PlanConfig
 */
export async function applyPlanHardware(
    node: string,
    vmId: string,
    specs: {
        cores: number;
        memory: number;   // in MB
        net0Rate?: number; // MB/s bandwidth limit (0 = unlimited)
    }
): Promise<void> {
    const payload: Record<string, string | number> = {
        cores:   specs.cores,
        sockets: 1,
        memory:  specs.memory,
        cpu:     "host",
    };

    // Update net0 rate limit if specified — preserve existing bridge/mac
    if (specs.net0Rate && specs.net0Rate > 0) {
        // Read current net0 config to preserve mac/bridge
        const config = await pveFetch(
            `/nodes/${node}/qemu/${vmId}/config`
        ) as Record<string, string>;

        const currentNet0 = config.net0 || "";
        // Strip existing rate= parameter and append the new one
        const netBase = currentNet0.replace(/,?rate=[\d.]+/g, "");
        payload.net0 = `${netBase},rate=${specs.net0Rate}`;
    }

    await pveFetch(`/nodes/${node}/qemu/${vmId}/config`, {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/**
 * Regenerate the Cloud-Init ISO image on a VM.
 *
 * Must be called after modifying Cloud-Init config (setCloudInitConfig)
 * for changes to take effect on the next boot.
 */
export async function regenerateCloudInitImage(
    node: string,
    vmId: string
): Promise<void> {
    await pveFetch(`/nodes/${node}/qemu/${vmId}/cloudinit`, {
        method: "PUT",
    });
}

/**
 * Query the QEMU Guest Agent for network interface information.
 *
 * Used to discover the VM's IP address after Cloud-Init provisioning.
 * Requires `qemu-guest-agent` installed and running inside the VM.
 *
 * @returns Array of network interfaces with IP addresses, or null
 *          if the guest agent is not responding.
 */
export async function getGuestAgentNetworkInfo(
    node: string,
    vmId: string
): Promise<GuestNetworkInterface[] | null> {
    try {
        const data = await pveFetch(
            `/nodes/${node}/qemu/${vmId}/agent/network-get-interfaces`
        );
        const result = data as { result?: GuestNetworkInterface[] };
        return result?.result ?? null;
    } catch {
        // Guest agent not ready or not installed — non-fatal
        return null;
    }
}

export interface GuestNetworkInterface {
    name: string;
    "hardware-address"?: string;
    "ip-addresses"?: {
        "ip-address": string;
        "ip-address-type": "ipv4" | "ipv6";
        prefix: number;
    }[];
}

/**
 * Extract the primary IPv4 address from guest agent network info.
 *
 * Skips loopback (127.x.x.x) and link-local (169.254.x.x) addresses.
 * Returns the first non-local IPv4 address, or null if unavailable.
 */
export function extractPrimaryIPv4(
    interfaces: GuestNetworkInterface[] | null
): string | null {
    if (!interfaces) return null;

    for (const iface of interfaces) {
        if (iface.name === "lo") continue;
        for (const addr of iface["ip-addresses"] ?? []) {
            if (
                addr["ip-address-type"] === "ipv4" &&
                !addr["ip-address"].startsWith("127.") &&
                !addr["ip-address"].startsWith("169.254.")
            ) {
                return addr["ip-address"];
            }
        }
    }
    return null;
}

