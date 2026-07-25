/**
 * Register / update LM Studio inference nodes.
 *
 * Talks to MariaDB directly rather than through Prisma: this project
 * generates a TypeScript client that needs the PrismaMariaDb driver adapter,
 * which a plain node script cannot import without a TS loader.
 *
 * Each node drives a GPU *pair* as one pooled device, so there are two
 * endpoints, not four:
 *
 *   2x RX 580   -> STANDARD (every signed-in user)
 *   2x RTX 2060 -> PREMIUM  (admins only)
 *
 * Usage — set only the nodes you want to write:
 *
 *   AI_RX580=http://10.10.0.100:1234/v1 \
 *   AI_RTX2060=http://10.0.1.12:1234/v1 \
 *   node scripts/seed-ai-nodes.cjs
 *
 * Model ids must match what LM Studio reports at GET /v1/models. Override
 * per node with AI_<NAME>_MODEL. Re-running updates existing rows by name
 * and never clears a stored API key.
 *
 * Nodes needing an Authorization header are not handled here — add those
 * through Admin -> AI Nodes so the key is encrypted at rest.
 */

require("dotenv").config();
const mariadb = require("mariadb");

const NODES = [
    {
        // Polaris has no current ROCm support — LM Studio drives these over
        // Vulkan. Slower than the Turing pair, hence the smaller defaults.
        env: "AI_RX580",
        name: "lm-rx580-pair",
        displayName: "RX 580 Pair",
        gpuLabel: "2x RX 580 - 16 GB",
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
        gpuLabel: "2x RTX 2060 - 18 GB",
        tier: "PREMIUM",
        defaultModel: "google/gemma-4-26b-a4b-qat",
        contextLen: 32768,
        maxTokens: 4096,
    },
];

/** cuid-ish id, stable per node name so re-runs stay idempotent. */
function idFor(name) {
    return `ainode-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error("DATABASE_URL is not set.");
        process.exit(1);
    }

    const u = new URL(url.replace(/^mysql:/, "mariadb:"));
    const conn = await mariadb.createConnection({
        host: u.hostname,
        port: Number(u.port) || 3306,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.slice(1),
    });

    let written = 0;
    let skipped = 0;

    for (const node of NODES) {
        const baseUrl = process.env[node.env];
        if (!baseUrl) {
            console.log(`skip  ${node.name.padEnd(18)} ${node.env} not set`);
            skipped++;
            continue;
        }

        const modelId = process.env[`${node.env}_MODEL`] || node.defaultModel;

        await conn.query(
            `INSERT INTO AiNode
               (id, name, displayName, gpuLabel, tier, baseUrl, modelId,
                contextLen, maxTokens, active, online, createdAt, updatedAt)
             VALUES (?,?,?,?,?,?,?,?,?,1,0,NOW(3),NOW(3))
             ON DUPLICATE KEY UPDATE
               baseUrl = VALUES(baseUrl),
               modelId = VALUES(modelId),
               tier = VALUES(tier),
               gpuLabel = VALUES(gpuLabel),
               updatedAt = NOW(3)`,
            [
                idFor(node.name), node.name, node.displayName, node.gpuLabel,
                node.tier, baseUrl, modelId, node.contextLen, node.maxTokens,
            ],
        );

        console.log(`ok    ${node.name.padEnd(18)} ${node.tier.padEnd(8)} ${baseUrl}  ${modelId}`);
        written++;
    }

    await conn.end();

    console.log(`\n${written} node(s) written, ${skipped} skipped.`);
    console.log("Probe each one from Admin -> AI Nodes to confirm the model id matches.");
})().catch(err => {
    console.error(err.message);
    process.exit(1);
});
