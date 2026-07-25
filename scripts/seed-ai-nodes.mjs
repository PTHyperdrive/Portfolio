/**
 * Seed the two LM Studio inference nodes.
 *
 * Each node drives a GPU *pair* as one pooled device, so there are two
 * endpoints, not four:
 *
 *   2× RX 580   → STANDARD (every signed-in user)
 *   2× RTX 2060 → PREMIUM  (admins only)
 *
 * Set the endpoints first, then run:
 *
 *   AI_RX580=http://10.0.1.51:1234/v1 \
 *   AI_RTX2060=http://10.0.1.53:1234/v1 \
 *   node scripts/seed-ai-nodes.mjs
 *
 * Model ids must match what LM Studio reports at GET /v1/models — override
 * per node with AI_<NAME>_MODEL. Re-running updates existing rows by name.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient();

const NODES = [
    {
        // Polaris has no current ROCm support — LM Studio drives these over
        // Vulkan. Slower than the Turing pair, hence the smaller defaults.
        env: "AI_RX580",
        name: "lm-rx580-pair",
        displayName: "RX 580 Pair",
        gpuLabel: "2× RX 580 · 16 GB",
        tier: "STANDARD",
        defaultModel: "qwen2.5-14b-instruct",
        contextLen: 8192,
        maxTokens: 2048,
    },
    {
        // Uneven pair: 6 GB (MSI, 03:00.0) + 12 GB (Colorful, 81:00.0).
        // llama.cpp splits by free VRAM, so the layer split is roughly 1:2.
        env: "AI_RTX2060",
        name: "lm-rtx2060-pair",
        displayName: "RTX 2060 Pair",
        gpuLabel: "2× RTX 2060 · 18 GB",
        tier: "PREMIUM",
        defaultModel: "qwen2.5-32b-instruct",
        contextLen: 32768,
        maxTokens: 4096,
    },
];

let seeded = 0;
let skipped = 0;

for (const node of NODES) {
    const baseUrl = process.env[node.env];
    if (!baseUrl) {
        console.log(`skip  ${node.name.padEnd(18)} ${node.env} not set`);
        skipped++;
        continue;
    }

    const modelId = process.env[`${node.env}_MODEL`] ?? node.defaultModel;

    await prisma.aiNode.upsert({
        where: { name: node.name },
        update: { baseUrl, modelId, tier: node.tier, gpuLabel: node.gpuLabel },
        create: {
            name: node.name,
            displayName: node.displayName,
            gpuLabel: node.gpuLabel,
            tier: node.tier,
            baseUrl,
            modelId,
            contextLen: node.contextLen,
            maxTokens: node.maxTokens,
        },
    });

    console.log(`ok    ${node.name.padEnd(18)} ${node.tier.padEnd(8)} ${baseUrl}  ${modelId}`);
    seeded++;
}

console.log(`\n${seeded} node(s) written, ${skipped} skipped.`);
console.log("Probe each one from Admin → AI Nodes to confirm the model id matches.");

await prisma.$disconnect();
