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
    /** Plan price in prepaid credits (1 Credit = 1 VND value) */
    priceInCredits: number;
}

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
    "Trial Plan": {
        vcpu: 1,
        ramMb: 1024,
        diskGb: 40,
        bandwidthMbits: 45,
        storageKeyword: "zfs",
        defaultOs: "Ubuntu 24.04 LTS",
        priceInCredits: 0,
    },
    "Nano-NAT": {
        vcpu: 1,
        ramMb: 1024,
        diskGb: 64,
        bandwidthMbits: 100,
        storageKeyword: "zfs",
        defaultOs: "Ubuntu 24.04 LTS",
        priceInCredits: 40000,
    },
    "Dev-Standard": {
        vcpu: 2,
        ramMb: 4096,
        diskGb: 80,
        bandwidthMbits: 250,
        storageKeyword: "zfs",
        defaultOs: "Ubuntu 24.04 LTS",
        priceInCredits: 120000,
    },
    "Perform-NVMe": {
        vcpu: 4,
        ramMb: 8192,
        diskGb: 80,
        bandwidthMbits: 500,
        storageKeyword: "nvme",
        defaultOs: "Ubuntu 24.04 LTS",
        priceInCredits: 280000,
    },
    "GPU-Media": {
        vcpu: 4,
        ramMb: 8192,
        diskGb: 50,
        bandwidthMbits: 1000,
        storageKeyword: "nvme",
        defaultOs: "Windows 11 23H2",
        priceInCredits: 350000,
    },
    "GPU-Compute": {
        vcpu: 8,
        ramMb: 16384,
        diskGb: 150,
        bandwidthMbits: 1000,
        storageKeyword: "nvme",
        defaultOs: "Ubuntu 24.04 LTS",
        priceInCredits: 850000,
    },
    "Operator-Exclusive": {
        vcpu: 16,
        ramMb: 32768,
        diskGb: 250,
        bandwidthMbits: 0,
        storageKeyword: "nvme",
        defaultOs: "Windows 11 24H2",
        priceInCredits: 0,
    },
};

export function getPlanConfig(plan: string): PlanConfig | null {
    return PLAN_CONFIGS[plan] ?? null;
}

/** Convert Mbit/s → MB/s for Proxmox rate parameter (returns 0 for unlimited) */
export function mbitToMBs(mbit: number): number {
    return mbit > 0 ? Math.round((mbit / 8) * 100) / 100 : 0;
}
