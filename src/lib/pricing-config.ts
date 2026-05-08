/**
 * Server-Side Pricing Configuration Resolver
 *
 * Merges the static PLAN_CONFIGS from plan-config.ts with dynamic overrides
 * stored in the SystemConfig table (key: "pricing_overrides").
 *
 * This module is the single source of truth for all pricing lookups at runtime.
 * Admin changes via the Pricing Dashboard are persisted to SystemConfig and
 * picked up here on the next request — zero downtime, no redeployment.
 *
 * Also manages USDT exchange rate and per-chain confirmation requirements.
 */

import { prisma } from "@/lib/db";
import { PLAN_CONFIGS, type PlanConfig } from "@/lib/plan-config";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PricingOverrides {
    [planName: string]: Partial<PlanConfig>;
}

export interface ExchangeRateConfig {
    /** Credits per 1 USDT (default: 26305 — based on 1 USDT = 26,305 VND) */
    usdtToCreditRate: number;
}

export interface ConfirmationConfig {
    /** Required blockchain confirmations per chain */
    TRC20: number;
    ERC20: number;
}

// ── SystemConfig Keys ────────────────────────────────────────────────────────

const KEY_PRICING_OVERRIDES = "pricing_overrides";
const KEY_USDT_EXCHANGE_RATE = "usdt_exchange_rate";
const KEY_CONFIRMATION_COUNTS = "crypto_confirmation_counts";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getConfigValue(key: string): Promise<string | null> {
    try {
        const row = await prisma.systemConfig.findUnique({ where: { key } });
        return row?.value ?? null;
    } catch {
        return null;
    }
}

async function setConfigValue(key: string, value: string): Promise<void> {
    await prisma.systemConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
    });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get all plan configs with DB overrides applied.
 * Returns a deep-merged copy — static defaults + dynamic admin edits.
 */
export async function getServerPlanConfigs(): Promise<Record<string, PlanConfig>> {
    const raw = await getConfigValue(KEY_PRICING_OVERRIDES);
    const overrides: PricingOverrides = raw ? JSON.parse(raw) : {};

    const merged: Record<string, PlanConfig> = {};
    for (const [name, config] of Object.entries(PLAN_CONFIGS)) {
        merged[name] = { ...config, ...(overrides[name] ?? {}) };
    }

    return merged;
}

/**
 * Get a single plan config with DB overrides applied.
 */
export async function getServerPlanConfig(plan: string): Promise<PlanConfig | null> {
    const all = await getServerPlanConfigs();
    return all[plan] ?? null;
}

/**
 * Persist pricing overrides to SystemConfig.
 * Only stores the diff from static defaults to keep payloads small.
 */
export async function savePricingOverrides(overrides: PricingOverrides): Promise<void> {
    await setConfigValue(KEY_PRICING_OVERRIDES, JSON.stringify(overrides));
}

/**
 * Get the current USDT-to-Credit exchange rate.
 * Default: 26305 (1 USDT = 26,305 VND = 26,305 Credits)
 */
export async function getUsdtExchangeRate(): Promise<number> {
    const raw = await getConfigValue(KEY_USDT_EXCHANGE_RATE);
    if (raw) {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 26305;
}

/**
 * Set the USDT-to-Credit exchange rate.
 */
export async function setUsdtExchangeRate(rate: number): Promise<void> {
    await setConfigValue(KEY_USDT_EXCHANGE_RATE, String(rate));
}

/**
 * Get required blockchain confirmations per chain.
 * Defaults: TRC20 = 1, ERC20 = 3
 */
export async function getRequiredConfirmations(): Promise<ConfirmationConfig> {
    const raw = await getConfigValue(KEY_CONFIRMATION_COUNTS);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            return {
                TRC20: typeof parsed.TRC20 === "number" ? parsed.TRC20 : 1,
                ERC20: typeof parsed.ERC20 === "number" ? parsed.ERC20 : 3,
            };
        } catch { /* fall through to defaults */ }
    }
    return { TRC20: 1, ERC20: 3 };
}

/**
 * Set required blockchain confirmations per chain.
 */
export async function setRequiredConfirmations(config: ConfirmationConfig): Promise<void> {
    await setConfigValue(KEY_CONFIRMATION_COUNTS, JSON.stringify(config));
}

/**
 * Calculate credit amount for a USDT top-up.
 */
export async function calculateCreditsFromUsdt(amountUsdt: number): Promise<number> {
    const rate = await getUsdtExchangeRate();
    return Math.floor(amountUsdt * rate);
}
