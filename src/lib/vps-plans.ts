/**
 * VPS Plans definition
 *
 * templateVmId: The Proxmox VMID of the template to clone for this OS.
 * Set these IDs to match your actual Proxmox template VMs.
 *
 * OS template mapping — update templateVmId values to match your PVE setup.
 */

export interface OsOption {
    id: string;
    label: string;
    templateVmId: number; // PVE template VMID to clone
    node: string;         // PVE node hosting the template
    icon: string;
}

export interface VpsPlan {
    id: string;
    name: string;
    tagline: string;
    price: number; // USD/month (0 = contact us)
    negotiate: boolean;
    featured: boolean;
    specs: {
        vcpu: number;
        ram_gb: number;
        disk_gb: number;
        bandwidth: string;
    };
    storage: string; // PVE storage pool for the disk
    color: string;  // accent colour for the card
    icon: string;
}

// ─── OS Templates ─────────────────────────────────────────────────────────────
// Update the templateVmId and node to match your Proxmox environment.
export const OS_OPTIONS: OsOption[] = [
    {
        id: "win11",
        label: "Windows 11 23H2",
        templateVmId: 9000, // <-- set your actual Windows 11 template VMID
        node: "StormWorking",
        icon: "🪟",
    },
    {
        id: "win2022",
        label: "Windows Server 2022",
        templateVmId: 9001, // <-- set your actual Windows Server 2022 template VMID
        node: "StormWorking",
        icon: "🖥️",
    },
    {
        id: "ubuntu22",
        label: "Ubuntu 22.04 LTS",
        templateVmId: 9010, // <-- set your actual Ubuntu 22.04 template VMID
        node: "StormWorking",
        icon: "🐧",
    },
    {
        id: "debian12",
        label: "Debian 12 Bookworm",
        templateVmId: 9011, // <-- set your actual Debian 12 template VMID
        node: "StormWorking",
        icon: "🌀",
    },
    {
        id: "centos9",
        label: "CentOS Stream 9",
        templateVmId: 9012, // <-- set your actual CentOS 9 template VMID
        node: "StormWorking",
        icon: "🎩",
    },
];

export function getOsOption(id: string): OsOption | undefined {
    return OS_OPTIONS.find((o) => o.id === id);
}

// ─── Plans ─────────────────────────────────────────────────────────────────────
export const VPS_PLANS: VpsPlan[] = [
    {
        id: "starter",
        name: "Starter",
        tagline: "Perfect for lightweight workloads",
        price: 9,
        negotiate: false,
        featured: false,
        specs: { vcpu: 1, ram_gb: 2, disk_gb: 32, bandwidth: "500 GB" },
        storage: "NVME",
        color: "var(--accent-cyan)",
        icon: "🚀",
    },
    {
        id: "standard",
        name: "Standard",
        tagline: "Balanced power for most projects",
        price: 19,
        negotiate: false,
        featured: true,
        specs: { vcpu: 2, ram_gb: 4, disk_gb: 64, bandwidth: "1 TB" },
        storage: "NVME",
        color: "var(--accent-purple)",
        icon: "⚡",
    },
    {
        id: "pro",
        name: "Pro",
        tagline: "High performance for demanding apps",
        price: 39,
        negotiate: false,
        featured: false,
        specs: { vcpu: 4, ram_gb: 8, disk_gb: 128, bandwidth: "2 TB" },
        storage: "NVME",
        color: "var(--accent-orange)",
        icon: "🔥",
    },
    {
        id: "enterprise",
        name: "Enterprise",
        tagline: "Custom specs — let's talk",
        price: 0,
        negotiate: true,
        featured: false,
        specs: { vcpu: 0, ram_gb: 0, disk_gb: 0, bandwidth: "Unlimited" },
        storage: "NVME",
        color: "var(--accent-green)",
        icon: "🏢",
    },
];

export function getPlan(id: string): VpsPlan | undefined {
    return VPS_PLANS.find((p) => p.id === id);
}
