import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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
    waitForTask,
} from "@/lib/proxmox";
import { validateAndResolveTemplate, resolveTemplateVmid } from "@/config/templates";
import { generateSecurePassword } from "@/lib/password-generator";
// Cloud-init password is stored AES-256-GCM encrypted at rest (same scheme as
// the TOTP secret) so it can be revealed to the owner later without keeping
// plaintext in the DB.
import { encryptTotpSecret as encryptSecret } from "@/lib/totp-crypto";

/**
 * POST /api/vps/deploy-cloudinit
 *
 * Cloud-Init based VM provisioning for guest (non-admin) users.
 * Uses pre-built Proxmox templates with the naming convention:
 *   '{OS}-{Version}-{GPUstate}'  (e.g. "UBUNTU-2404-NoGPU")
 *
 * Flow:
 *   1. Auth + validate inputs (plan, template, hostname, SSH keys)
 *   2. Billing — same ticket/credit math as legacy deploy
 *   3. Clone template → resize disk → set CI config → apply hardware
 *   4. Start VM → return provisioning status
 *
 * Admin users should use the legacy POST /api/vps/deploy instead.
 * This endpoint rejects role=ADMIN to enforce the dual-path architecture.
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        // ── Parse body ────────────────────────────────────────────────
        let body: Record<string, unknown> = {};
        try { body = await req.json(); } catch { /* optional */ }

        const requestedPlanRaw = (body.plan       as string) || "";
        const templateId       = (body.templateId as string) || "";
        const hostname         = (body.hostname   as string) || "";
        const ciuser           = (body.username   as string) || "";
        const sshPublicKeys    = (body.sshKeys    as string) || "";
        const ciPasswordRaw    = (body.password   as string) || "";
        const requestedCount   = Math.min(
            Math.max(1, parseInt(String(body.instanceCount ?? "1"), 10) || 1),
            10  // hard cap
        );

        // ── Validate required fields ─────────────────────────────────
        if (!requestedPlanRaw) {
            return NextResponse.json({ error: "No plan selected." }, { status: 400 });
        }
        if (!templateId) {
            return NextResponse.json({ error: "No OS template selected." }, { status: 400 });
        }
        if (!hostname.trim()) {
            return NextResponse.json({ error: "Hostname is required." }, { status: 400 });
        }
        if (!ciuser.trim()) {
            return NextResponse.json({ error: "Username is required." }, { status: 400 });
        }

        // Validate username format (Cloud-Init user: alphanumeric + underscores)
        const usernameRegex = /^[a-z_][a-z0-9_-]{0,31}$/;
        if (!usernameRegex.test(ciuser)) {
            return NextResponse.json({
                error: "Invalid username. Use lowercase letters, numbers, underscores, and hyphens (max 32 chars, must start with letter or underscore).",
            }, { status: 400 });
        }

        // Validate hostname format (RFC 1123)
        const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
        if (!hostnameRegex.test(hostname)) {
            return NextResponse.json({
                error: "Invalid hostname. Use only letters, numbers, and hyphens (max 63 chars).",
            }, { status: 400 });
        }

        // ── Password: use provided or auto-generate ──────────────────
        // If blank, generate a secure random password that meets Windows
        // complexity requirements (uppercase + lowercase + digit + special)
        const ciPassword = ciPasswordRaw.trim() || generateSecurePassword(16);
        const passwordWasGenerated = !ciPasswordRaw.trim();

        // ── 0. Free-trial fast-path ──────────────────────────────────
        const isFreeTrial = requestedPlanRaw === "free-trial";

        if (isFreeTrial) {
            const trialUser = await prisma.user.findUnique({
                where:  { id: userId },
                select: { hasUsedTrial: true },
            });

            if (!trialUser) {
                return NextResponse.json({ error: "User not found" }, { status: 404 });
            }

            if (trialUser.hasUsedTrial) {
                return NextResponse.json(
                    { error: "You have already used your free trial." },
                    { status: 403 }
                );
            }

            // Invitation gate: user must have a redeemed invitation code
            const hasInvitation = await prisma.invitationRedemption.findFirst({
                where: { userId },
            });
            if (!hasInvitation) {
                return NextResponse.json(
                    { error: "A valid invitation code is required to activate the free trial." },
                    { status: 403 }
                );
            }
        }

        // ── 1. Resolve plan ──────────────────────────────────────────
        const dbUser = await prisma.user.findUnique({
            where:  { id: userId },
            select: { activePlan: true, credits: true, role: true },
        });

        if (!dbUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const plan = isFreeTrial
            ? "Trial Plan"
            : (requestedPlanRaw || dbUser.activePlan || "");

        const planCfg = getPlanConfig(plan);
        if (!planCfg) {
            return NextResponse.json({ error: `Unknown plan: ${plan}` }, { status: 400 });
        }

        // ── 2. Resolve template ──────────────────────────────────────
        let templateName: string;
        let templateInfo: { defaultUser: string };
        let family: "linux" | "windows" = "linux";
        let knownVmid: number | null = null;
        try {
            const resolved = validateAndResolveTemplate(plan, templateId, planCfg);
            templateName = resolved.templateName;
            templateInfo = { defaultUser: resolved.template.defaultUser };
            family = resolved.template.family;
            // Fast VMID resolution — skips API name-search for templates
            // with hardcoded VMIDs (e.g. Ubuntu 24.04 = 9000, 22.04 = 9001)
            knownVmid = resolveTemplateVmid(templateId, planCfg.requiresGpu);
        } catch (err) {
            return NextResponse.json(
                { error: err instanceof Error ? err.message : "Invalid template configuration" },
                { status: 400 }
            );
        }

        // ── 3. VM limit check ────────────────────────────────────────
        const existingVmCount = await prisma.vpsInstance.count({ where: { userId } });
        if (existingVmCount + requestedCount > 10) {
            return NextResponse.json({
                error: `Cannot deploy ${requestedCount} instance(s) — you already have ${existingVmCount} VM(s) and the limit is 10.`,
            }, { status: 400 });
        }

        // ── 4. Ticket math (server-side, authoritative) ──────────────
        const isFree = isFreeTrial || planCfg.priceInCredits === 0;
        const isAdmin = dbUser.role === "ADMIN";

        let ticketsToUse: { id: string; validUntil: Date }[] = [];
        let toCharge    = requestedCount;
        let totalCost   = 0;

        if (!isFree) {
            const availableTickets = await prisma.deploymentTicket.findMany({
                where: {
                    userId,
                    planId:     plan,
                    status:     "AVAILABLE",
                    validUntil: { gt: new Date() },
                },
                orderBy: { validUntil: "asc" },
                take: requestedCount,
            });

            ticketsToUse = availableTickets.slice(0, requestedCount);
            toCharge     = requestedCount - ticketsToUse.length;
            totalCost    = toCharge * planCfg.priceInCredits;

            if (!isAdmin && totalCost > 0 && Number(dbUser.credits) < totalCost) {
                return NextResponse.json({
                    error: `Insufficient credits. Need ${totalCost.toLocaleString()}, ` +
                           `have ${Number(dbUser.credits).toLocaleString()}.`,
                }, { status: 402 });
            }
        }

        // ── 5. Resolve storage ───────────────────────────────────────
        const allPools = await getAllNodesStorage();
        const isNvme   = planCfg.storageKeyword.toLowerCase().includes("nvme");
        const best     = selectBestStorage(allPools, planCfg.storageKeyword, isNvme);

        if (!best) {
            return NextResponse.json(
                { error: "No available storage. Please try again later or contact support." },
                { status: 503 }
            );
        }
        const { node, storage } = best;

        // ── 6. Ensure service record ─────────────────────────────────
        let service = await prisma.service.findFirst({ where: { name: plan } });
        if (!service) {
            service = await prisma.service.create({
                data: { name: plan, type: "VPS", description: `${plan} VPS`, price: 0 },
            });
        }

        const expiresAt30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const rateMBs      = mbitToMBs(planCfg.bandwidthMbits);

        // ── 7. Deploy each instance (sequential for unique VMIDs) ────
        const deployedVms: {
            vmid: number;
            node: string;
            hostname: string;
            templateName: string;
        }[] = [];

        for (let i = 0; i < requestedCount; i++) {
            const vmid    = await getNextVmId();
            const vmName  = requestedCount === 1
                ? hostname
                : `${hostname}-${i + 1}`;

            // a) Clone the template (LINKED clone for fast provisioning)
            const cloneUpid = await cloneTemplate(
                node,
                templateName,
                vmid,
                vmName,
                storage,
                false,      // linked clone (shared base image, fast + storage-efficient)
                knownVmid   // null = fallback to name-search
            );

            // Wait for clone task to complete
            await waitForTask(node, cloneUpid, 120_000);

            // b) Resize disk to match plan
            await resizeDisk(node, String(vmid), "scsi0", planCfg.diskGb);

            // c) Apply plan hardware (CPU, RAM, bandwidth)
            await applyPlanHardware(node, String(vmid), {
                cores:    planCfg.vcpu,
                memory:   planCfg.ramMb,
                net0Rate: rateMBs > 0 ? rateMBs : undefined,
            });

            // d) Set Cloud-Init configuration.
            // Windows guests run Cloudbase-Init, which only reads the
            // ConfigDrive datasource → citype must be "configdrive2". Linux uses
            // the NoCloud default. The password is always set (auto-generated if
            // the user left it blank) because Windows has no SSH-only login path.
            const ciConfig: Parameters<typeof setCloudInitConfig>[2] = {
                ciuser:     ciuser,
                cipassword: ciPassword,
                ipconfig0:  "ip=dhcp",
                nameserver: "8.8.8.8 1.1.1.1",
                citype:     family === "windows" ? "configdrive2" : "nocloud",
            };

            // Inject SSH key for both families — on Windows it's applied to the
            // OpenSSH server's authorized_keys when that role is present in the image.
            if (sshPublicKeys.trim()) {
                ciConfig.sshkeys = encodeURIComponent(sshPublicKeys.trim());
            }

            await setCloudInitConfig(node, String(vmid), ciConfig);

            // e) Regenerate Cloud-Init ISO
            await regenerateCloudInitImage(node, String(vmid));

            // f) Start the VM
            await startVM(node, String(vmid));

            deployedVms.push({
                vmid,
                node,
                hostname: vmName,
                templateName,
            });
        }

        // ── 8. Atomic DB transaction ─────────────────────────────────
        const newTickets: { id: string; validUntil: Date }[] = [];
        for (let i = 0; i < toCharge; i++) {
            const t = await prisma.deploymentTicket.create({
                data: {
                    userId,
                    planId:     plan,
                    status:     "IN_USE",
                    validUntil: expiresAt30d,
                },
            });
            newTickets.push({ id: t.id, validUntil: t.validUntil });
        }

        const allTicketIds: ({ id: string; validUntil: Date } | null)[] = [
            ...ticketsToUse,
            ...newTickets,
        ];
        while (allTicketIds.length < requestedCount) allTicketIds.push(null);

        const order = await prisma.order.create({
            data: {
                userId,
                serviceId: service.id,
                status:    "ACTIVE",
                totalPrice: totalCost,
                notes: `Cloud-Init deploy: ${requestedCount}× ${plan} (${templateName}). ` +
                       `Tickets: ${ticketsToUse.length}, Charged: ${toCharge}.`,
            },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txOps: any[] = [];

        // a) Deduct credits
        if (!isAdmin && totalCost > 0) {
            txOps.push(
                prisma.user.update({
                    where: { id: userId },
                    data:  { credits: { decrement: totalCost } },
                }),
                prisma.creditTransaction.create({
                    data: {
                        userId,
                        type:    "VM_Deduction",
                        amount:  -totalCost,
                        details: `Cloud-Init: ${requestedCount}× ${plan} (${templateName})`,
                    },
                })
            );
        }

        // b) Mark trial used
        if (isFreeTrial) {
            txOps.push(
                prisma.user.update({
                    where: { id: userId },
                    data:  { hasUsedTrial: true },
                })
            );
        }

        // c) Consume existing tickets
        for (const t of ticketsToUse) {
            txOps.push(
                prisma.deploymentTicket.update({
                    where: { id: t.id },
                    data:  { status: "IN_USE" },
                })
            );
        }

        // d) Create VpsInstance records
        for (let i = 0; i < deployedVms.length; i++) {
            const vm     = deployedVms[i];
            const ticket = allTicketIds[i];
            txOps.push(
                prisma.vpsInstance.create({
                    data: {
                        userId,
                        orderId:   order.id,
                        vmId:      String(vm.vmid),
                        node:      vm.node,
                        name:      vm.hostname,
                        os:        templateName,
                        status:    "running",
                        ciUsername: ciuser,
                        ciPassword: encryptSecret(ciPassword),
                        ticketId:  ticket?.id ?? undefined,
                        expiresAt: ticket?.validUntil ?? expiresAt30d,
                        specs: {
                            vcpu:           planCfg.vcpu,
                            ram_gb:         planCfg.ramMb / 1024,
                            disk_gb:        planCfg.diskGb,
                            storage,
                            storageKeyword: planCfg.storageKeyword,
                            templateName,
                            provisionMethod: "cloud-init",
                        },
                    },
                })
            );
        }

        await prisma.$transaction(txOps);

        return NextResponse.json({
            success:          true,
            deployed:         deployedVms.length,
            vmids:            deployedVms.map(v => v.vmid),
            node,
            templateName,
            username:         ciuser,
            password:         passwordWasGenerated ? ciPassword : undefined,
            passwordGenerated: passwordWasGenerated,
            ticketsUsed:      ticketsToUse.length,
            instancesCharged: isAdmin ? 0 : toCharge,
            totalCost:        isAdmin ? 0 : totalCost,
            isFreeTrial,
            provisionMethod:  "cloud-init",
            cloneType:        "linked",
            message: `${deployedVms.length} VM(s) deployed via Cloud-Init on ${node}. ` +
                     `Template: ${templateName}. User: ${ciuser}. ` +
                     (passwordWasGenerated ? "Password was auto-generated. " : "") +
                     (isAdmin
                         ? "Admin deploy -- no credits deducted."
                         : `${ticketsToUse.length} ticket(s) applied, ${toCharge} charged (${totalCost.toLocaleString()} Credits).`),
        });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("Cloud-Init deploy error:", error);
        return NextResponse.json({ error: `Deployment failed: ${msg}` }, { status: 500 });
    }
}
