/**
 * VM Template Registry
 *
 * Maps the user's selected OS + GPU state to the exact Proxmox template
 * name used on the hypervisor. The naming convention is strictly:
 *
 *     '{OS}-{Version}-{GPUstate}'
 *
 * Examples: "UBUNTU-2404-NoGPU", "WIN11-23H2-vGPU", "DEBIAN-12-NoGPU"
 *
 * ─── Architecture ────────────────────────────────────────────────────
 *
 * 1. The front-end selects a `templateId` (e.g. "ubuntu-24") and a plan.
 * 2. The plan's `requiresGpu` boolean determines the GPU state suffix.
 * 3. `resolveTemplateName(templateId, requiresGpu)` returns the exact
 *    Proxmox template name string that the backend uses to clone.
 * 4. The backend passes this string to `qm clone` or the Proxmox API.
 *
 * ─── Adding a New Template ───────────────────────────────────────────
 *
 * 1. Create the VM template on every Proxmox node (both NoGPU and vGPU
 *    variants if applicable).
 * 2. Add an entry to `CLOUD_TEMPLATES` below.
 * 3. If the OS needs both GPU variants, ensure both template VMs exist
 *    on the hypervisor with matching names.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type GpuState = "NoGPU" | "vGPU";
export type OsFamily = "linux" | "windows";

export interface CloudTemplate {
    /** Frontend identifier — matches OS_OPTIONS[].id on the compute page */
    id: string;
    /** Human-readable label */
    label: string;
    /** OS version string for display */
    version: string;
    /** Path to the OS icon in /public/icons/ */
    iconPath: string;
    /** OS family for filtering */
    family: OsFamily;
    /**
     * Proxmox template name prefix (before GPU suffix).
     * Final template name = `${proxmoxPrefix}-${gpuState}`
     * e.g. "UBUNTU-2404" → "UBUNTU-2404-NoGPU" or "UBUNTU-2404-vGPU"
     */
    proxmoxPrefix: string;
    /** Default SSH user created by Cloud-Init (Linux only) */
    defaultUser: string;
    /** Minimum disk size in GB that this template requires */
    minDiskGb: number;
    /** Whether this template supports Cloud-Init automated provisioning */
    supportsCloudInit: boolean;
    /**
     * GPU variants available for this template.
     * Most Linux images support both; some Windows images may be GPU-only.
     */
    availableGpuStates: GpuState[];
    /**
     * Hardcoded Proxmox VMIDs for each GPU variant.
     * Maps GpuState → VMID on the hypervisor.
     *
     * When present, cloneTemplate() uses the VMID directly (O(1) lookup)
     * instead of searching all VMs by name (API round-trip).
     *
     * Set to `null` for templates not yet created on the host.
     */
    knownVmids: Partial<Record<GpuState, number>> | null;
}

// ─── Template Registry ───────────────────────────────────────────────────────

export const CLOUD_TEMPLATES: readonly CloudTemplate[] = [
    // ── Linux ────────────────────────────────────────────────────────
    // VMIDs confirmed on Timox-1 (see Proxmox datacenter screenshot)
    {
        id:                 "ubuntu-24",
        label:              "Ubuntu",
        version:            "24.04 LTS",
        iconPath:           "/icons/ubuntu.svg",
        family:             "linux",
        proxmoxPrefix:      "UBUNTU-2404",
        defaultUser:        "ubuntu",
        minDiskGb:          10,
        supportsCloudInit:  true,
        availableGpuStates: ["NoGPU", "vGPU"],
        knownVmids:         { NoGPU: 9000 },  // VMID 9000 on Timox-1
    },
    {
        id:                 "ubuntu-22",
        label:              "Ubuntu",
        version:            "22.04 LTS",
        iconPath:           "/icons/ubuntu.svg",
        family:             "linux",
        proxmoxPrefix:      "UBUNTU-2204",
        defaultUser:        "ubuntu",
        minDiskGb:          10,
        supportsCloudInit:  true,
        availableGpuStates: ["NoGPU", "vGPU"],
        knownVmids:         { NoGPU: 9001 },  // VMID 9001 on Timox-1
    },
    // Templates below are not yet created on the host.
    // knownVmids = null → cloneTemplate() will fall back to name-search.
    {
        id:                 "debian-12",
        label:              "Debian",
        version:            "12 Bookworm",
        iconPath:           "/icons/debian.svg",
        family:             "linux",
        proxmoxPrefix:      "DEBIAN-12",
        defaultUser:        "debian",
        minDiskGb:          8,
        supportsCloudInit:  true,
        availableGpuStates: ["NoGPU", "vGPU"],
        knownVmids:         null,
    },
    {
        id:                 "alma-9",
        label:              "AlmaLinux",
        version:            "9 x86_64",
        iconPath:           "/icons/almalinux.svg",
        family:             "linux",
        proxmoxPrefix:      "ALMA-9",
        defaultUser:        "almalinux",
        minDiskGb:          10,
        supportsCloudInit:  true,
        availableGpuStates: ["NoGPU", "vGPU"],
        knownVmids:         null,
    },
    {
        id:                 "rocky-9",
        label:              "Rocky Linux",
        version:            "9.3",
        iconPath:           "/icons/rocky.svg",
        family:             "linux",
        proxmoxPrefix:      "ROCKY-9",
        defaultUser:        "rocky",
        minDiskGb:          10,
        supportsCloudInit:  true,
        availableGpuStates: ["NoGPU", "vGPU"],
        knownVmids:         null,
    },
    {
        id:                 "centos-9",
        label:              "CentOS Stream",
        version:            "9",
        iconPath:           "/icons/centos.svg",
        family:             "linux",
        proxmoxPrefix:      "CENTOS-9",
        defaultUser:        "cloud-user",
        minDiskGb:          10,
        supportsCloudInit:  true,
        availableGpuStates: ["NoGPU", "vGPU"],
        knownVmids:         null,
    },

    // ── Windows ──────────────────────────────────────────────────────
    // Windows templates use Cloudbase-Init (configdrive2 format).
    // Not yet created on the host — knownVmids = null.
    {
        id:                 "win-11",
        label:              "Windows",
        version:            "11 23H2",
        iconPath:           "/icons/windows.svg",
        family:             "windows",
        proxmoxPrefix:      "WIN11-23H2",
        defaultUser:        "Admin",
        minDiskGb:          40,
        supportsCloudInit:  true,
        availableGpuStates: ["NoGPU", "vGPU"],
        knownVmids:         null,
    },
    {
        id:                 "win-2022",
        label:              "Windows Server",
        version:            "2022",
        iconPath:           "/icons/windows.svg",
        family:             "windows",
        proxmoxPrefix:      "WINSRV-2022",
        defaultUser:        "Admin",
        minDiskGb:          32,
        supportsCloudInit:  true,
        availableGpuStates: ["NoGPU", "vGPU"],
        knownVmids:         null,
    },
] as const;

// ─── Resolver Functions ──────────────────────────────────────────────────────

/**
 * Resolve a frontend template ID + GPU requirement into the exact
 * Proxmox template name string.
 *
 * @param templateId  - e.g. "ubuntu-24", "win-11"
 * @param requiresGpu - from PlanConfig.requiresGpu
 * @returns           - e.g. "UBUNTU-2404-NoGPU", "WIN11-23H2-vGPU"
 *
 * @throws Error if the template ID is invalid or the GPU state is
 *         not available for that template.
 */
export function resolveTemplateName(
    templateId: string,
    requiresGpu: boolean
): string {
    const template = getTemplateById(templateId);
    if (!template) {
        throw new Error(`Unknown template ID: "${templateId}"`);
    }

    const gpuState: GpuState = requiresGpu ? "vGPU" : "NoGPU";

    if (!template.availableGpuStates.includes(gpuState)) {
        throw new Error(
            `Template "${template.label} ${template.version}" does not support ` +
            `GPU state "${gpuState}". Available: [${template.availableGpuStates.join(", ")}]`
        );
    }

    return `${template.proxmoxPrefix}-${gpuState}`;
}

/**
 * Resolve the hardcoded Proxmox VMID for a template + GPU state.
 *
 * Returns the known VMID if it exists in the registry, or null to
 * signal that the caller must fall back to a name-based API search.
 *
 * @param templateId  - Frontend template ID (e.g. "ubuntu-24")
 * @param requiresGpu - Whether the plan requires GPU passthrough
 * @returns VMID number or null
 */
export function resolveTemplateVmid(
    templateId: string,
    requiresGpu: boolean
): number | null {
    const template = getTemplateById(templateId);
    if (!template?.knownVmids) return null;

    const gpuState: GpuState = requiresGpu ? "vGPU" : "NoGPU";
    return template.knownVmids[gpuState] ?? null;
}

/**
 * Look up a template by its frontend ID.
 */
export function getTemplateById(id: string): CloudTemplate | undefined {
    return CLOUD_TEMPLATES.find(t => t.id === id);
}

/**
 * Get all templates filtered by OS family.
 */
export function getTemplatesByFamily(family: OsFamily): CloudTemplate[] {
    return CLOUD_TEMPLATES.filter(t => t.family === family);
}

/**
 * Get all templates that support Cloud-Init provisioning.
 */
export function getCloudInitTemplates(): CloudTemplate[] {
    return CLOUD_TEMPLATES.filter(t => t.supportsCloudInit);
}

/**
 * Get templates compatible with a specific plan.
 * GPU plans only show templates that have a vGPU variant.
 * Non-GPU plans show templates with a NoGPU variant.
 */
export function getTemplatesForPlan(requiresGpu: boolean): CloudTemplate[] {
    const gpuState: GpuState = requiresGpu ? "vGPU" : "NoGPU";
    return CLOUD_TEMPLATES.filter(t =>
        t.supportsCloudInit && t.availableGpuStates.includes(gpuState)
    );
}

// ─── Plan → Template Validation ──────────────────────────────────────────────

/**
 * Full provisioning payload validation.
 * Returns the resolved Proxmox template name or throws with a
 * user-facing error message.
 *
 * @param planId     - Plan identifier (e.g. "Dev-Standard", "GPU-Media")
 * @param templateId - Frontend template ID (e.g. "ubuntu-24", "win-11")
 * @param planConfig - The PlanConfig object from plan-config.ts
 */
export function validateAndResolveTemplate(
    planId: string,
    templateId: string,
    planConfig: { requiresGpu: boolean; diskGb: number }
): { templateName: string; template: CloudTemplate } {
    const template = getTemplateById(templateId);
    if (!template) {
        throw new Error(`Invalid OS template: "${templateId}"`);
    }

    if (!template.supportsCloudInit) {
        throw new Error(
            `"${template.label} ${template.version}" does not support automated provisioning.`
        );
    }

    // Validate disk size meets template minimum
    if (planConfig.diskGb < template.minDiskGb) {
        throw new Error(
            `Plan "${planId}" provides ${planConfig.diskGb} GB disk, but ` +
            `"${template.label} ${template.version}" requires at least ${template.minDiskGb} GB.`
        );
    }

    const templateName = resolveTemplateName(templateId, planConfig.requiresGpu);

    return { templateName, template };
}

// ─── Proxmox Host Commands Reference ─────────────────────────────────────────
//
// To create these templates on each Proxmox node, run:
//
// # ── Linux (Cloud-Init via qcow2 import) ────────────────────────
// # Example: Ubuntu 24.04 NoGPU
// qm create 9000 --name UBUNTU-2404-NoGPU --memory 2048 --cores 2 \
//   --net0 virtio,bridge=vmbr0 --scsihw virtio-scsi-pci --ostype l26
// qm set 9000 --scsi0 local-lvm:0,import-from=/var/lib/vz/template/noble-server-cloudimg-amd64.img
// qm set 9000 --ide2 local-lvm:cloudinit
// qm set 9000 --boot order=scsi0
// qm set 9000 --serial0 socket --vga serial0
// qm set 9000 --agent enabled=1,fstrim_cloned_disks=1
// qm template 9000
//
// # Example: Ubuntu 24.04 vGPU (same as above + PCIe passthrough)
// qm create 9010 --name UBUNTU-2404-vGPU --memory 2048 --cores 2 \
//   --net0 virtio,bridge=vmbr0 --scsihw virtio-scsi-pci --ostype l26
// qm set 9010 --scsi0 local-lvm:0,import-from=/var/lib/vz/template/noble-server-cloudimg-amd64.img
// qm set 9010 --ide2 local-lvm:cloudinit
// qm set 9010 --boot order=scsi0
// qm set 9010 --serial0 socket --vga serial0
// qm set 9010 --agent enabled=1,fstrim_cloned_disks=1
// qm set 9010 --hostpci0 0000:01:00.0,pcie=1
// qm template 9010
//
// # ── Windows (Cloudbase-Init via prepared disk) ─────────────────
// # Windows templates must be prepared manually with Cloudbase-Init
// # installed inside the guest before converting to template.
// # See: https://pve.proxmox.com/wiki/Cloud-Init_Support#Cloud-Init_on_Windows
//
// # After preparation:
// qm set 9050 --name WIN11-23H2-NoGPU
// qm set 9050 --ide2 local-lvm:cloudinit
// qm template 9050
