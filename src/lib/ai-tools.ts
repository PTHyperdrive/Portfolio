/**
 * AI Tool Registry — the complete set of actions an assistant may take
 *
 * This module is the single source of truth for both MCP surfaces (the stdio
 * server and the HTTP endpoint) and the in-chat tool loop. One registry means
 * one place to audit, and no chance of the surfaces drifting apart.
 *
 * Read the constraints in ai-security.ts before adding anything here.
 * In particular:
 *
 *   - Every tool is read-only. proxmox.ts exports startVM/stopVM/restartVM;
 *     none of them are reachable from this file, and that is the point. An
 *     injected instruction cannot call a tool that was never registered.
 *   - No tool takes a URL, host, path, node address or command string.
 *     Parameters are ids, slugs and free-text queries only.
 *   - Tools that expose infrastructure detail require ADMIN. Tools a tenant
 *     may run are scoped to that tenant's own rows by userId, in the query.
 */

import { prisma } from "@/lib/db";
import { fetchAllVMs, fetchNodes } from "@/lib/proxmox";
import { searchKnowledge } from "@/lib/ai-knowledge";
import {
    visibilitiesForRole, toolAllowedForRole, frameUntrusted,
    sanitiseToolResult, type ToolTier,
} from "@/lib/ai-security";
import { audit } from "@/lib/audit";

export interface ToolContext {
    userId: string;
    role: string;
}

export interface ToolDefinition {
    name: string;
    description: string;
    /** JSON Schema for the arguments object. */
    parameters: Record<string, unknown>;
    minTier: ToolTier;
    /** Returns text destined for a model. Never returns secrets. */
    run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

const str = (v: unknown, fallback = ""): string =>
    typeof v === "string" ? v : fallback;

/* ─── Knowledge tools ────────────────────────────────────────────── */

const searchDocs: ToolDefinition = {
    name: "search_infrastructure_docs",
    description:
        "Search the operator's infrastructure documentation (network topology, machine guides, " +
        "web guides, runbooks, security policy). Use this before answering any question about " +
        "how this specific system is built. Returns passages with their source document.",
    minTier: "STANDARD",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "What to look for, in natural language." },
        },
        required: ["query"],
    },
    async run(args, ctx) {
        const query = str(args.query).trim();
        if (!query) return "No query supplied.";

        const hits = await searchKnowledge(query, ctx.role);
        if (hits.length === 0) {
            return "No documentation matched that query. Say so rather than guessing.";
        }

        return hits
            .map((h, i) => `[${i + 1}] ${h.docTitle} — ${h.category} (relevance ${h.score.toFixed(2)})\n${h.content}`)
            .join("\n\n");
    },
};

const listDocs: ToolDefinition = {
    name: "list_infrastructure_docs",
    description:
        "List the infrastructure documents available to this caller, with titles and categories. " +
        "Use to discover what topics are documented before searching.",
    minTier: "STANDARD",
    parameters: { type: "object", properties: {} },
    async run(_args, ctx) {
        const docs = await prisma.aiKnowledgeDoc.findMany({
            where: { published: true, visibility: { in: visibilitiesForRole(ctx.role) } },
            select: { slug: true, title: true, category: true, updatedAt: true },
            orderBy: [{ category: "asc" }, { title: "asc" }],
        });

        if (docs.length === 0) return "No documents are published for this caller.";

        return docs
            .map(d => `- ${d.title} [${d.category}] slug=${d.slug} updated=${d.updatedAt.toISOString().slice(0, 10)}`)
            .join("\n");
    },
};

const getDoc: ToolDefinition = {
    name: "get_infrastructure_doc",
    description: "Read one infrastructure document in full, by its slug.",
    minTier: "STANDARD",
    parameters: {
        type: "object",
        properties: { slug: { type: "string", description: "Document slug from list_infrastructure_docs." } },
        required: ["slug"],
    },
    async run(args, ctx) {
        const slug = str(args.slug).trim();
        if (!slug) return "No slug supplied.";

        // Visibility is part of the lookup, so an ADMIN-only slug is simply
        // not found for a tenant rather than 403-ing and confirming it exists.
        const doc = await prisma.aiKnowledgeDoc.findFirst({
            where: {
                slug,
                published: true,
                visibility: { in: visibilitiesForRole(ctx.role) },
            },
            select: { title: true, category: true, content: true, source: true },
        });

        if (!doc) return `No published document with slug "${slug}" is available to this caller.`;

        return `# ${doc.title}\nCategory: ${doc.category}${doc.source ? `\nSource: ${doc.source}` : ""}\n\n${doc.content}`;
    },
};

/* ─── Live status tools (read-only) ──────────────────────────────── */

const myServices: ToolDefinition = {
    name: "get_my_services",
    description:
        "List the virtual machines belonging to the current user, with status and specification. " +
        "Scoped to the caller — never returns another tenant's resources.",
    minTier: "STANDARD",
    parameters: { type: "object", properties: {} },
    async run(_args, ctx) {
        const vms = await prisma.vpsInstance.findMany({
            where: { userId: ctx.userId },
            select: {
                name: true, os: true, status: true, vmId: true,
                createdAt: true, expiresAt: true, specs: true,
            },
            orderBy: { createdAt: "desc" },
        });

        if (vms.length === 0) return "This user has no virtual machines.";

        return vms.map(v => {
            const specs = v.specs as { vcpu?: number; ram_gb?: number; disk_gb?: number } | null;
            const spec = specs ? `${specs.vcpu ?? "?"} vCPU / ${specs.ram_gb ?? "?"} GB RAM / ${specs.disk_gb ?? "?"} GB` : "spec unknown";
            const expiry = v.expiresAt ? ` expires=${v.expiresAt.toISOString().slice(0, 10)}` : "";
            return `- ${v.name} (${v.os}) status=${v.status} ${spec}${expiry}`;
        }).join("\n");
    },
};

const aiNodeStatus: ToolDefinition = {
    name: "get_ai_node_status",
    description:
        "Report the inference nodes this caller may use, with model, GPU and online state. " +
        "Useful for answering why a model is unavailable or slow.",
    minTier: "STANDARD",
    parameters: { type: "object", properties: {} },
    async run(_args, ctx) {
        const tiers = ctx.role === "ADMIN" ? ["STANDARD", "PREMIUM"] : ["STANDARD"];
        const nodes = await prisma.aiNode.findMany({
            where: { active: true, tier: { in: tiers as ("STANDARD" | "PREMIUM")[] } },
            select: {
                displayName: true, gpuLabel: true, tier: true, modelId: true,
                online: true, contextLen: true, lastCheckAt: true, lastError: true,
            },
            orderBy: { tier: "desc" },
        });

        if (nodes.length === 0) return "No inference nodes are available to this caller.";

        // baseUrl is deliberately absent — a tenant has no need for the LAN
        // address, and the model has no need to repeat it.
        return nodes.map(n =>
            `- ${n.displayName} [${n.tier}] gpu=${n.gpuLabel} model=${n.modelId} ` +
            `context=${n.contextLen} online=${n.online}` +
            (n.online ? "" : ` lastError=${n.lastError ?? "unknown"}`),
        ).join("\n");
    },
};

const hypervisorStatus: ToolDefinition = {
    name: "get_hypervisor_status",
    description:
        "Operator view of the Proxmox cluster: node health and virtual machine states. " +
        "Administrator only.",
    minTier: "ADMIN",
    parameters: { type: "object", properties: {} },
    async run() {
        try {
            const [nodes, vms] = await Promise.all([
                fetchNodes().catch(() => null),
                fetchAllVMs().catch(() => null),
            ]);

            const parts: string[] = [];

            if (Array.isArray(nodes) && nodes.length) {
                parts.push("Nodes:\n" + nodes.map((n: Record<string, unknown>) =>
                    `- ${String(n.node ?? n.name ?? "?")} status=${String(n.status ?? "?")}`).join("\n"));
            }

            if (Array.isArray(vms) && vms.length) {
                const running = vms.filter((v: Record<string, unknown>) => v.status === "running").length;
                parts.push(`Virtual machines: ${vms.length} total, ${running} running`);
                parts.push(vms.slice(0, 40).map((v: Record<string, unknown>) =>
                    `- vmid=${String(v.vmid ?? v.id ?? "?")} name=${String(v.name ?? "?")} status=${String(v.status ?? "?")}`).join("\n"));
            }

            return parts.length ? parts.join("\n\n") : "Hypervisor returned no data.";
        } catch (err) {
            return `Hypervisor query failed: ${err instanceof Error ? err.message : "unknown error"}`;
        }
    },
};

const platformSummary: ToolDefinition = {
    name: "get_platform_summary",
    description:
        "Aggregate platform counts: users, active VMs, AI nodes, published documents. " +
        "Counts only, no personal data. Administrator only.",
    minTier: "ADMIN",
    parameters: { type: "object", properties: {} },
    async run() {
        const [users, vms, running, aiNodes, docs] = await Promise.all([
            prisma.user.count(),
            prisma.vpsInstance.count(),
            prisma.vpsInstance.count({ where: { status: "running" } }),
            prisma.aiNode.count({ where: { active: true } }),
            prisma.aiKnowledgeDoc.count({ where: { published: true } }),
        ]);

        return [
            `Users: ${users}`,
            `Virtual machines: ${vms} (${running} running)`,
            `Active AI nodes: ${aiNodes}`,
            `Published knowledge documents: ${docs}`,
        ].join("\n");
    },
};

/* ─── Registry ───────────────────────────────────────────────────── */

const ALL_TOOLS: ToolDefinition[] = [
    searchDocs,
    listDocs,
    getDoc,
    myServices,
    aiNodeStatus,
    hypervisorStatus,
    platformSummary,
];

/** Tools this role may see and call. */
export function toolsForRole(role: string): ToolDefinition[] {
    return ALL_TOOLS.filter(t => toolAllowedForRole(t.minTier, role));
}

export function findTool(name: string): ToolDefinition | undefined {
    return ALL_TOOLS.find(t => t.name === name);
}

export interface ToolOutcome {
    ok: boolean;
    /** Sanitised, injection-framed text safe to hand to a model. */
    text: string;
    redacted: string[];
}

/**
 * The only supported way to run a tool.
 *
 * Enforces the tier gate, runs the tool, redacts credential-shaped text and
 * wraps the result as untrusted data, then audits the outcome. Every caller —
 * chat loop, HTTP MCP, stdio MCP — goes through here so the controls cannot
 * be bypassed by adding a new surface.
 */
export async function executeTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
    req?: Request,
): Promise<ToolOutcome> {
    const tool = findTool(name);

    if (!tool) {
        void audit({
            userId: ctx.userId,
            action: "AI_TOOL_DENIED",
            resourceType: "AiTool",
            resourceId: name,
            outcome: "DENIED",
            metadata: { reason: "unknown_tool" },
            req,
        });
        return {
            ok: false,
            text: frameUntrusted(name, `No tool named "${name}" exists.`),
            redacted: [],
        };
    }

    if (!toolAllowedForRole(tool.minTier, ctx.role)) {
        // Worth seeing in the log: either a confused model or someone probing.
        void audit({
            userId: ctx.userId,
            action: "AI_TOOL_DENIED",
            resourceType: "AiTool",
            resourceId: name,
            outcome: "DENIED",
            metadata: { reason: "tier", required: tool.minTier, role: ctx.role },
            req,
        });
        return {
            ok: false,
            text: frameUntrusted(name, "This tool requires administrator access. Tell the user plainly that you cannot run it."),
            redacted: [],
        };
    }

    let raw: string;
    try {
        raw = await tool.run(args, ctx);
    } catch (err) {
        console.error(`[ai-tools] ${name} failed:`, err);
        raw = `Tool "${name}" failed to execute.`;
    }

    const { text, redacted } = sanitiseToolResult(name, raw);

    void audit({
        userId: ctx.userId,
        action: name === "search_infrastructure_docs" ? "AI_KNOWLEDGE_SEARCH" : "AI_TOOL_CALL",
        resourceType: "AiTool",
        resourceId: name,
        metadata: {
            args: Object.keys(args),
            redacted: redacted.length ? redacted : undefined,
            chars: text.length,
        },
        req,
    });

    return { ok: true, text, redacted };
}

/** OpenAI-compatible function specs, for the chat tool loop. */
export function toolSpecsForRole(role: string) {
    return toolsForRole(role).map(t => ({
        type: "function" as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
        },
    }));
}
