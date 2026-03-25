/**
 * Plan → Hardware Configuration Map
 *
 * Each entry maps a plan name (matching PLAN_PRICES on payment page)
 * to its Proxmox hardware specifications.
 *
 * storageKeyword: case-insensitive substring to match against storage pool names
 *   e.g. "zfs" matches "local-zfs", "nvme" matches "SSD-NVME-2TB"
 */

export interface PlanConfig {
    vcpu: number;
    ramMb: number;
    diskGb: number;
    /** Mbit/s bandwidth limit (0 = unlimited) */
    bandwidthMbits: number;
    /** Keyword for smart storage pool selection */
    storageKeyword: string;
    /** Human-readable OS family default for display */
    defaultOs: string;
}

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
    "Trial Plan": {
        vcpu: 2,
        ramMb: 2048,
        diskGb: 32,
        bandwidthMbits: 45,
        storageKeyword: "zfs",
        defaultOs: "Ubuntu 24.04 LTS",
    },
    "Cloud Starter": {
        vcpu: 2,
        ramMb: 4096,
        diskGb: 80,
        bandwidthMbits: 100,
        storageKeyword: "nvme",
        defaultOs: "Ubuntu 24.04 LTS",
    },
    "Cloud Gaming": {
        vcpu: 8,
        ramMb: 16384,
        diskGb: 256,
        bandwidthMbits: 1000,
        storageKeyword: "nvme",
        defaultOs: "Windows 11 24H2",
    },
    "Cloud Workstation": {
        vcpu: 8,
        ramMb: 32768,
        diskGb: 500,
        bandwidthMbits: 1000,
        storageKeyword: "nvme",
        defaultOs: "Windows 11 24H2",
    },
    "Enterprise": {
        vcpu: 32,
        ramMb: 131072,
        diskGb: 2048,
        bandwidthMbits: 0,
        storageKeyword: "nvme",
        defaultOs: "Ubuntu 24.04 LTS",
    },
    "Anti-Detect VPS": {
        vcpu: 32,
        ramMb: 65536,
        diskGb: 256,
        bandwidthMbits: 0,
        storageKeyword: "nvme",
        defaultOs: "Windows 11 24H2",
    },
};

export function getPlanConfig(plan: string): PlanConfig | null {
    return PLAN_CONFIGS[plan] ?? null;
}

/** Convert Mbit/s → MB/s for Proxmox rate parameter (returns 0 for unlimited) */
export function mbitToMBs(mbit: number): number {
    return mbit > 0 ? Math.round((mbit / 8) * 100) / 100 : 0;
}
