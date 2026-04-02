/**
 * Nextcloud Cloud Storage Provisioner — Phase 2
 *
 * Manages per-USER Nextcloud storage quotas. Each user gets one NC account.
 * This is NOT per-VM — it is a user-scoped cloud file storage bucket.
 *
 * Rules:
 *   - 5 GB free base tier (auto-provisioned when first VM is active)
 *   - Paid expansion must be in strict 5 GB increments
 *   - Maximum 100 GB total per user (5 free + 95 paid max)
 *   - Prerequisite: user must have ≥1 active VpsInstance (any paid tier)
 *
 * Pricing for paid expansion (VND per GB — same tiers as block storage):
 *   NVME: 2,000 VND/GB  (fastest tier)
 *   SATA: 1,200 VND/GB  (balanced tier)
 *   HDD:    350 VND/GB  (economy tier)
 *
 * Environment variables required:
 *   NEXTCLOUD_URL   — e.g. "https://cloud.notrespond.com"
 *   NEXTCLOUD_ADMIN — admin username
 *   NEXTCLOUD_PASS  — admin app token (NOT password)
 */

export type StorageType = "nvme" | "sata" | "hdd";

/** VND per GB — Phase 1 (block) and Phase 2 (cloud) share same pricing */
export const STORAGE_PRICING: Record<StorageType, number> = {
    nvme: 2000,
    sata: 1200,
    hdd:   350,
};

export const STORAGE_LABELS: Record<StorageType, string> = {
    nvme: "NVMe SSD",
    sata: "SATA SSD",
    hdd:  "HDD",
};

// ── Nextcloud quota rules ──────────────────────────────────────────

export const NC_FREE_GB        = 5;    // base free tier for all eligible users
export const NC_MAX_TOTAL_GB   = 100;  // hard cap per user
export const NC_STEP_GB        = 5;    // paid expansion must be in this increment
export const NC_MAX_PAID_GB    = NC_MAX_TOTAL_GB - NC_FREE_GB; // 95 GB

/**
 * Validate that a requested paid expansion amount is valid.
 * Must be a positive integer multiple of NC_STEP_GB, and
 * result cannot exceed NC_MAX_PAID_GB.
 *
 * @returns error string or null if valid
 */
export function validateNcExpansion(
    requestedGb:  number,
    currentPaidGb: number
): string | null {
    if (!Number.isInteger(requestedGb) || requestedGb <= 0) {
        return `Storage expansion must be a positive whole number of GB.`;
    }
    if (requestedGb % NC_STEP_GB !== 0) {
        return `Storage must be purchased in ${NC_STEP_GB} GB blocks (e.g. 5, 10, 15 … 95 GB).`;
    }
    if (currentPaidGb + requestedGb > NC_MAX_PAID_GB) {
        const remaining = NC_MAX_PAID_GB - currentPaidGb;
        return `Exceeds maximum. You can add at most ${remaining} GB more (cap: ${NC_MAX_TOTAL_GB} GB).`;
    }
    return null;
}

/**
 * Derive the Nextcloud username for a user.
 * Convention: "user-<first 8 chars of userId>"
 */
export function userToNcUsername(userId: string): string {
    return `user-${userId.slice(0, 8)}`;
}

/** Calculate cost of a Nextcloud expansion */
export function calcNcCost(type: StorageType, gb: number): number {
    return STORAGE_PRICING[type] * gb;
}

// ── Nextcloud OCS API helpers ──────────────────────────────────────

function ncBase(): string {
    const url = process.env.NEXTCLOUD_URL;
    if (!url) throw new Error("NEXTCLOUD_URL is not configured.");
    return url.replace(/\/$/, "");
}

function ncAuth(): string {
    const user = process.env.NEXTCLOUD_ADMIN;
    const pass = process.env.NEXTCLOUD_PASS;
    if (!user || !pass) throw new Error("NEXTCLOUD_ADMIN / NEXTCLOUD_PASS not configured.");
    return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

async function ncFetch(method: string, path: string, body?: URLSearchParams): Promise<Response> {
    const res = await fetch(`${ncBase()}${path}`, {
        method,
        headers: {
            "Authorization":  ncAuth(),
            "OCS-APIREQUEST": "true",
            ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body: body?.toString(),
    });
    return res;
}

// ── Public provisioning functions ──────────────────────────────────

/**
 * Ensure a Nextcloud user account exists.
 * Creates the account if it doesn't exist yet with a random password
 * (the user will log in via SSO or app tokens — never direct NC login).
 */
export async function ensureNcUser(ncUsername: string): Promise<void> {
    const check = await ncFetch("GET", `/ocs/v1.php/cloud/users/${ncUsername}?format=json`);
    if (check.status === 200) return;

    const password = crypto.randomUUID();
    const res = await ncFetch("POST", "/ocs/v1.php/cloud/users",
        new URLSearchParams({ userid: ncUsername, password })
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create NC user: ${res.status} ${text}`);
    }
}

/**
 * Set the absolute Nextcloud quota for a user.
 * This overwrites the previous quota — always pass the NEW total.
 *
 * @param ncUsername  - Nextcloud username
 * @param totalGb     - New absolute quota in GB
 */
export async function setNcQuota(ncUsername: string, totalGb: number): Promise<void> {
    const quotaMb = totalGb * 1024;
    const res = await ncFetch("PUT", `/ocs/v1.php/cloud/users/${ncUsername}`,
        new URLSearchParams({ key: "quota", value: `${quotaMb} MB` })
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to set NC quota: ${res.status} ${text}`);
    }
}

/**
 * Full provisioning flow:
 * 1. Ensure user account exists in Nextcloud
 * 2. Set quota to newTotalGb (absolute)
 */
export async function provisionNcStorage(
    ncUsername: string,
    newTotalGb: number
): Promise<void> {
    await ensureNcUser(ncUsername);
    await setNcQuota(ncUsername, newTotalGb);
}

/**
 * Build the manual occ fallback command if the OCS API call fails.
 * Return this in the API response so the admin can run it manually.
 */
export function occFallbackCommand(ncUsername: string, totalGb: number): string {
    return `sudo -u www-data php /var/www/nextcloud/occ user:setting ${ncUsername} files quota "${totalGb * 1024} MB"`;
}
