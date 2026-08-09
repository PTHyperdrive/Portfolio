/**
 * VM Provisioning Jobs — step executor + n8n dispatch
 *
 * Architecture: n8n orchestrates, this module executes. Every workflow step
 * is an HTTP call back into /api/internal/provision/step, which lands in
 * executeProvisionStep below — so Proxmox credentials, TLS pinning and the
 * typed client (src/lib/proxmox.ts) never leave the app. n8n holds nothing
 * but a callback URL and a shared secret.
 *
 * Money is NOT handled here. The deploy route charges credits/tickets in a
 * transaction BEFORE a job exists; `compensate` refunds using the charge
 * facts recorded on the job (params.chargedCredits, ticketWasPreexisting).
 *
 * Every step is idempotent: `clone` short-circuits when job.vmId is set,
 * `finalize` when job.vpsInstanceId is set, `compensate` on terminal status —
 * so a replayed webhook or a retried step call cannot double-clone or
 * double-refund.
 *
 * When n8n is down at dispatch time, runProvisioningJobInline drives the
 * same steps in-process — one code path for the actual work, two drivers.
 */

import { createHmac } from "crypto";
import { prisma } from "@/lib/db";
import { getPlanConfig, mbitToMBs } from "@/lib/plan-config";
import {
    getAllNodesStorage,
    selectBestStorage,
    getNextVmId,
    cloneTemplate,
    resizeDisk,
    setCloudInitConfig,
    applyPlanHardware,
    regenerateCloudInitImage,
    startVM,
    destroyVM,
    waitForTask,
    getGuestAgentNetworkInfo,
    extractPrimaryIPv4,
} from "@/lib/proxmox";
import { safeDecryptTotpSecret as decryptSecret } from "@/lib/totp-crypto";
import { audit } from "@/lib/audit";

/** Steps in execution order, as the n8n workflow calls them. */
export const PROVISION_STEPS = [
    "clone", "resize", "hardware", "cloudinit", "start", "fetch_ip", "finalize",
] as const;
export type ProvisionStep = typeof PROVISION_STEPS[number] | "compensate";

export interface ProvisionJobParams {
    vmName: string;
    ciuser: string;
    /** AES-256-GCM encrypted (totp-crypto scheme); decrypted only in `cloudinit`. */
    ciPasswordEnc: string;
    sshKeys?: string;
    templateName: string;
    knownVmid: number | null;
    family: "linux" | "windows";
    storage?: string;          // chosen at clone time
    ipAddress?: string;        // set by fetch_ip
    /** Credits this specific instance charged (0 when covered by a ticket/free). */
    chargedCredits: number;
    /** True when the linked ticket existed before this job (revert vs delete). */
    ticketWasPreexisting: boolean;
}

export interface StepResult {
    ok: boolean;
    /** Transient not-ready (guest agent still booting) — caller should retry. */
    retry?: boolean;
    detail?: string;
    jobStatus: string;
}

type Job = NonNullable<Awaited<ReturnType<typeof loadJob>>>;

function loadJob(jobId: string) {
    return prisma.provisioningJob.findUnique({ where: { id: jobId } });
}

function jobParams(job: Job): ProvisionJobParams {
    return job.params as unknown as ProvisionJobParams;
}

async function appendLog(
    jobId: string, step: string, ok: boolean, ms: number, detail?: string,
) {
    const job = await loadJob(jobId);
    if (!job) return;
    const log = Array.isArray(job.stepLog) ? job.stepLog as unknown[] : [];
    log.push({ step, ok, ms, at: new Date().toISOString(), ...(detail ? { detail } : {}) });
    await prisma.provisioningJob.update({
        where: { id: jobId },
        data: { stepLog: log as object[], currentStep: step },
    });
}

/* ─── The step executor ──────────────────────────────────────────── */

export async function executeProvisionStep(
    jobId: string,
    step: ProvisionStep,
): Promise<StepResult> {
    const job = await loadJob(jobId);
    if (!job) return { ok: false, detail: "Job not found", jobStatus: "UNKNOWN" };

    // Terminal jobs accept no further work; a replayed call is a no-op.
    if (["SUCCEEDED", "COMPENSATED", "TIMED_OUT"].includes(job.status)) {
        return { ok: step === "finalize" || step === "compensate", detail: `Job already ${job.status}`, jobStatus: job.status };
    }
    if (job.status === "FAILED" && step !== "compensate") {
        return { ok: false, detail: "Job already FAILED", jobStatus: job.status };
    }

    if (job.status === "QUEUED" && step !== "compensate") {
        await prisma.provisioningJob.update({
            where: { id: jobId }, data: { status: "RUNNING" },
        });
    }

    const started = Date.now();
    try {
        const result = await runStep(job, step);
        await appendLog(jobId, step, result.ok, Date.now() - started, result.detail);
        const after = await loadJob(jobId);
        return { ...result, jobStatus: after?.status ?? "UNKNOWN" };
    } catch (err) {
        const detail = err instanceof Error ? err.message : "step failed";
        console.error(`[provisioning] job ${jobId} step ${step} failed:`, err);
        await appendLog(jobId, step, false, Date.now() - started, detail);
        await prisma.provisioningJob.update({
            where: { id: jobId },
            data: { status: "FAILED", error: detail },
        });
        return { ok: false, detail, jobStatus: "FAILED" };
    }
}

async function runStep(
    job: Job,
    step: ProvisionStep,
): Promise<{ ok: boolean; retry?: boolean; detail?: string }> {
    const p = jobParams(job);
    const planCfg = getPlanConfig(job.planId);
    if (!planCfg) throw new Error(`Unknown plan on job: ${job.planId}`);

    switch (step) {
        case "clone": {
            if (job.vmId) return { ok: true, detail: `Already cloned as VMID ${job.vmId}` };

            const pools = await getAllNodesStorage();
            const isNvme = planCfg.storageKeyword.toLowerCase().includes("nvme");
            const best = selectBestStorage(pools, planCfg.storageKeyword, isNvme);
            if (!best) throw new Error("No storage pool available");

            const vmid = await getNextVmId();
            const upid = await cloneTemplate(
                best.node, p.templateName, vmid, p.vmName, best.storage,
                false /* linked clone */, p.knownVmid,
            );
            await waitForTask(best.node, upid, 120_000);

            await prisma.provisioningJob.update({
                where: { id: job.id },
                data: {
                    vmId: vmid,
                    node: best.node,
                    params: { ...(job.params as object), storage: best.storage },
                },
            });
            return { ok: true, detail: `VMID ${vmid} on ${best.node}/${best.storage}` };
        }

        case "resize": {
            requireVm(job);
            await resizeDisk(job.node!, String(job.vmId), "scsi0", planCfg.diskGb);
            return { ok: true, detail: `${planCfg.diskGb}G` };
        }

        case "hardware": {
            requireVm(job);
            const rateMBs = mbitToMBs(planCfg.bandwidthMbits);
            await applyPlanHardware(job.node!, String(job.vmId), {
                cores: planCfg.vcpu,
                memory: planCfg.ramMb,
                net0Rate: rateMBs > 0 ? rateMBs : undefined,
            });
            return { ok: true, detail: `${planCfg.vcpu} vCPU / ${planCfg.ramMb} MB` };
        }

        case "cloudinit": {
            requireVm(job);
            const config: Parameters<typeof setCloudInitConfig>[2] = {
                ciuser: p.ciuser,
                cipassword: decryptSecret(p.ciPasswordEnc),
                ipconfig0: "ip=dhcp",
                nameserver: "8.8.8.8 1.1.1.1",
                // Cloudbase-Init (Windows) only reads ConfigDrive.
                citype: p.family === "windows" ? "configdrive2" : "nocloud",
            };
            if (p.sshKeys?.trim()) config.sshkeys = encodeURIComponent(p.sshKeys.trim());

            await setCloudInitConfig(job.node!, String(job.vmId), config);
            await regenerateCloudInitImage(job.node!, String(job.vmId));
            return { ok: true };
        }

        case "start": {
            requireVm(job);
            await startVM(job.node!, String(job.vmId));
            return { ok: true };
        }

        case "fetch_ip": {
            requireVm(job);
            const interfaces = await getGuestAgentNetworkInfo(job.node!, String(job.vmId));
            const ip = extractPrimaryIPv4(interfaces);
            if (!ip) {
                // Server-side retry cap: a template without a guest agent
                // never reports an IP — after the budget is spent, succeed
                // without one (matches the legacy path) so the workflow's
                // retry loop can never spin forever.
                const attempts = (Array.isArray(job.stepLog) ? job.stepLog as { step?: string }[] : [])
                    .filter(e => e.step === "fetch_ip").length;
                if (attempts >= FETCH_IP_RETRIES) {
                    return { ok: true, detail: "No guest agent — proceeding without IP" };
                }
                // Guest agent not up yet — n8n (or the inline driver) retries.
                return { ok: false, retry: true, detail: "Guest agent not ready" };
            }
            await prisma.provisioningJob.update({
                where: { id: job.id },
                data: { params: { ...(job.params as object), ipAddress: ip } },
            });
            return { ok: true, detail: ip };
        }

        case "finalize": {
            if (job.vpsInstanceId) return { ok: true, detail: "Already finalized" };
            requireVm(job);
            if (!job.orderId) throw new Error("Job has no orderId");

            const ticket = job.ticketId
                ? await prisma.deploymentTicket.findUnique({
                    where: { id: job.ticketId }, select: { validUntil: true },
                })
                : null;
            const expiresAt = ticket?.validUntil
                ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            // Re-read params — fetch_ip may have updated them after our load.
            const fresh = await loadJob(job.id);
            const fp = fresh ? jobParams(fresh) : p;

            const instance = await prisma.vpsInstance.create({
                data: {
                    userId: job.userId,
                    orderId: job.orderId,
                    vmId: String(job.vmId),
                    node: job.node!,
                    name: fp.vmName,
                    os: fp.templateName,
                    status: "running",
                    ciUsername: fp.ciuser,
                    ciPassword: fp.ciPasswordEnc, // already encrypted at rest
                    ipAddress: fp.ipAddress ?? null,
                    ticketId: job.ticketId ?? undefined,
                    expiresAt,
                    specs: {
                        vcpu: planCfg.vcpu,
                        ram_gb: planCfg.ramMb / 1024,
                        disk_gb: planCfg.diskGb,
                        storage: fp.storage,
                        storageKeyword: planCfg.storageKeyword,
                        templateName: fp.templateName,
                        provisionMethod: "n8n-cloud-init",
                    },
                },
            });

            await prisma.provisioningJob.update({
                where: { id: job.id },
                data: {
                    status: "SUCCEEDED",
                    vpsInstanceId: instance.id,
                    completedAt: new Date(),
                    error: null,
                },
            });

            void audit({
                userId: job.userId,
                action: "VM_CREATE",
                resourceType: "VirtualMachine",
                resourceId: String(job.vmId),
                metadata: { jobId: job.id, plan: job.planId, via: "n8n" },
            });
            return { ok: true, detail: `VpsInstance ${instance.id}` };
        }

        case "compensate": {
            return await compensate(job);
        }

        default:
            throw new Error(`Unknown step: ${step as string}`);
    }
}

function requireVm(job: Job): void {
    if (!job.vmId || !job.node) throw new Error("Job has no VM yet — clone must run first");
}

/* ─── Compensation ───────────────────────────────────────────────── */

/**
 * Undo a half-provisioned job: best-effort destroy of the clone, refund of
 * whatever this job charged, ticket returned or removed. Idempotent — a
 * second call on a COMPENSATED job is a no-op (guarded in executeProvisionStep).
 */
async function compensate(job: Job): Promise<{ ok: boolean; detail?: string }> {
    const p = jobParams(job);
    const notes: string[] = [];
    let destroyFailed = false;

    // 1. Destroy the orphaned VM, if a clone happened.
    if (job.vmId && job.node) {
        try {
            await destroyVM(job.node, String(job.vmId));
            notes.push(`destroyed VMID ${job.vmId}`);
            void audit({
                userId: job.userId,
                action: "VM_DESTROY",
                resourceType: "VirtualMachine",
                resourceId: String(job.vmId),
                metadata: { jobId: job.id, reason: "provisioning compensation" },
            });
        } catch (err) {
            destroyFailed = true;
            notes.push(`destroy failed: ${err instanceof Error ? err.message : "?"}`);
        }
    }

    // 2. Money back — atomically.
    const txOps = [];
    if (p.chargedCredits > 0) {
        txOps.push(
            prisma.user.update({
                where: { id: job.userId },
                data: { credits: { increment: p.chargedCredits } },
            }),
            prisma.creditTransaction.create({
                data: {
                    userId: job.userId,
                    type: "VM_Refund",
                    amount: p.chargedCredits,
                    details: `Provisioning failed — refund for job ${job.id} (${job.planId})`,
                },
            }),
        );
        notes.push(`refunded ${p.chargedCredits} credits`);
    }
    if (job.ticketId) {
        if (p.ticketWasPreexisting) {
            // The user's prepaid ticket goes back on the shelf.
            txOps.push(prisma.deploymentTicket.update({
                where: { id: job.ticketId },
                data: { status: "AVAILABLE" },
            }));
            notes.push("ticket returned");
        } else {
            // Ticket was minted for this charge; the charge was refunded above.
            txOps.push(prisma.deploymentTicket.delete({ where: { id: job.ticketId } }));
            notes.push("ticket removed");
        }
    }
    if (txOps.length) await prisma.$transaction(txOps);

    await prisma.provisioningJob.update({
        where: { id: job.id },
        data: {
            // A failed destroy leaves an orphan on the hypervisor — keep the
            // job FAILED so it surfaces to an admin instead of looking clean.
            status: destroyFailed ? "FAILED" : "COMPENSATED",
            error: notes.join("; "),
            completedAt: new Date(),
        },
    });

    return { ok: !destroyFailed, detail: notes.join("; ") };
}

/* ─── Drivers ────────────────────────────────────────────────────── */

/** HMAC-SHA256 signature n8n verifies before running a workflow. */
export function signN8nPayload(rawBody: string): string {
    const secret = process.env.N8N_WEBHOOK_SECRET ?? "";
    return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Hand a job to n8n. Returns false when n8n is unreachable or refuses —
 * the caller falls back to the inline driver.
 */
export async function dispatchJobToN8n(jobId: string, idempotencyKey: string): Promise<boolean> {
    const url = process.env.N8N_WEBHOOK_URL;
    if (!url) return false;

    const body = JSON.stringify({ jobId, idempotencyKey });
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-nrsp-signature": signN8nPayload(body),
            },
            body,
            signal: AbortSignal.timeout(10_000),
        });
        return res.ok;
    } catch (err) {
        console.error(`[provisioning] n8n dispatch failed for job ${jobId}:`, err);
        return false;
    }
}

const FETCH_IP_RETRIES = 10;
const FETCH_IP_DELAY_MS = 15_000;

/**
 * Inline fallback driver — same steps, no n8n. Fire-and-forget from the
 * deploy route; progress is visible through the job row either way.
 */
export async function runProvisioningJobInline(jobId: string): Promise<void> {
    for (const step of ["clone", "resize", "hardware", "cloudinit", "start"] as const) {
        const r = await executeProvisionStep(jobId, step);
        if (!r.ok) {
            await executeProvisionStep(jobId, "compensate");
            return;
        }
    }

    // Guest agent needs time to boot before it can report an IP.
    let gotIp = false;
    for (let i = 0; i < FETCH_IP_RETRIES; i++) {
        const r = await executeProvisionStep(jobId, "fetch_ip");
        if (r.ok) { gotIp = true; break; }
        if (!r.retry) { await executeProvisionStep(jobId, "compensate"); return; }
        await new Promise(resolve => setTimeout(resolve, FETCH_IP_DELAY_MS));
    }
    // No IP is not fatal — templates without a guest agent still finalize;
    // the ipAddress stays null exactly as the legacy path behaved.
    void gotIp;

    const done = await executeProvisionStep(jobId, "finalize");
    if (!done.ok) await executeProvisionStep(jobId, "compensate");
}
