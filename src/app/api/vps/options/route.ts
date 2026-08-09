import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { pveFetch, getAllNodesStorage } from "@/lib/proxmox";
import { CLOUD_TEMPLATES, type GpuState } from "@/config/templates";
import { getServerPlanConfigs } from "@/lib/pricing-config";

/**
 * GET /api/vps/options — what can actually be deployed right now.
 *
 * "Use what exists" made structural: the template list is discovered live
 * from the hypervisor (VMs flagged template=1, matched against the
 * CLOUD_TEMPLATES naming convention '{PREFIX}-{NoGPU|vGPU}'), so the UI
 * only ever offers images that physically exist. GPU plans appear the day
 * a '-vGPU' template is built — no code deploy needed.
 *
 * Cached in-memory for 60 s; the deploy route still validates on submit.
 */

export const dynamic = "force-dynamic";

interface OptionsPayload {
    templates: {
        id: string;
        label: string;
        version: string;
        iconPath: string;
        family: string;
        defaultUser: string;
        minDiskGb: number;
        gpuStates: GpuState[]; // which variants exist on the hypervisor
    }[];
    plans: {
        name: string;
        vcpu: number;
        ramMb: number;
        diskGb: number;
        bandwidthMbits: number;
        priceInCredits: number;
        requiresGpu: boolean;
        deployable: boolean;
    }[];
    capacity: { node: string; storage: string; availGb: number }[];
}

let cache: { at: number; payload: OptionsPayload } | null = null;
const CACHE_MS = 60_000;

export async function GET() {
    const { error } = await requireUser();
    if (error) return error;

    if (cache && Date.now() - cache.at < CACHE_MS) {
        return NextResponse.json(cache.payload);
    }

    // ── Live template discovery ─────────────────────────────────────
    let templateNames = new Set<string>();
    try {
        const resources = await pveFetch("/cluster/resources?type=vm") as {
            name?: string; template?: number;
        }[];
        templateNames = new Set(
            resources
                .filter(r => r.template === 1 && typeof r.name === "string")
                .map(r => r.name as string),
        );
    } catch (err) {
        console.error("[api/vps/options] template discovery failed:", err);
        // Degrade to the registry's known VMIDs rather than an empty list.
        for (const t of CLOUD_TEMPLATES) {
            if (t.knownVmids?.NoGPU) templateNames.add(`${t.proxmoxPrefix}-NoGPU`);
            if (t.knownVmids?.vGPU) templateNames.add(`${t.proxmoxPrefix}-vGPU`);
        }
    }

    const templates = CLOUD_TEMPLATES
        .filter(t => t.supportsCloudInit)
        .map(t => ({
            id: t.id,
            label: t.label,
            version: t.version,
            iconPath: t.iconPath,
            family: t.family,
            defaultUser: t.defaultUser,
            minDiskGb: t.minDiskGb,
            gpuStates: (["NoGPU", "vGPU"] as GpuState[]).filter(g =>
                t.availableGpuStates.includes(g) && templateNames.has(`${t.proxmoxPrefix}-${g}`)),
        }))
        .filter(t => t.gpuStates.length > 0);

    const anyVgpu = templates.some(t => t.gpuStates.includes("vGPU"));

    // ── Plans (with admin pricing overrides applied) ────────────────
    const planConfigs = await getServerPlanConfigs();
    const plans = Object.entries(planConfigs).map(([name, cfg]) => ({
        name,
        vcpu: cfg.vcpu,
        ramMb: cfg.ramMb,
        diskGb: cfg.diskGb,
        bandwidthMbits: cfg.bandwidthMbits,
        priceInCredits: cfg.priceInCredits,
        requiresGpu: cfg.requiresGpu ?? false,
        // A GPU plan is only deployable once a vGPU template exists; a
        // non-GPU plan needs at least one NoGPU template.
        deployable: cfg.requiresGpu
            ? anyVgpu
            : templates.some(t => t.gpuStates.includes("NoGPU")),
    }));

    // ── Capacity ────────────────────────────────────────────────────
    let capacity: OptionsPayload["capacity"] = [];
    try {
        const pools = await getAllNodesStorage();
        capacity = pools.map(pl => ({
            node: pl.node,
            storage: pl.storage,
            availGb: Math.floor(pl.avail / (1024 ** 3)),
        }));
    } catch (err) {
        console.error("[api/vps/options] storage discovery failed:", err);
    }

    const payload: OptionsPayload = { templates, plans, capacity };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload);
}
