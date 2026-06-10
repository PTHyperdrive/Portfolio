/**
 * Billing Period Math — hourly / daily / weekly / monthly
 *
 * Monthly `priceInCredits` (from plan-config + admin overrides) stays the
 * anchor price. Shorter periods are derived from it pro-rata with a small
 * flexibility premium (shorter commitment = slightly higher unit cost),
 * unless the admin has manually pinned a price for that period via the
 * pricing dashboard (`periodPrices` override on the plan).
 *
 * Resolution order per period:
 *   1. plan.periodPrices[period]  — admin manual price (wins)
 *   2. priceInCredits × (hours/720) × premium — derived default
 */

import type { PlanConfig } from "@/lib/plan-config";

export type BillingPeriod = "hourly" | "daily" | "weekly" | "monthly";

export const PERIOD_HOURS: Record<BillingPeriod, number> = {
    hourly: 1,
    daily: 24,
    weekly: 168,
    monthly: 720,
};

/** Flexibility premium applied to derived (non-pinned) prices. */
export const PERIOD_PREMIUM: Record<BillingPeriod, number> = {
    hourly: 1.2,
    daily: 1.1,
    weekly: 1.05,
    monthly: 1.0,
};

export type PeriodPrices = Record<BillingPeriod, number>;

/**
 * Resolve all four period prices for a plan.
 * `periodPrices` (admin-pinned) values win; the rest derive from monthly.
 */
export function resolvePeriodPrices(plan: PlanConfig): PeriodPrices {
    const monthly = plan.priceInCredits;
    const pinned = plan.periodPrices ?? {};
    const out = {} as PeriodPrices;

    for (const period of Object.keys(PERIOD_HOURS) as BillingPeriod[]) {
        const manual = pinned[period];
        if (typeof manual === "number" && manual >= 0) {
            out[period] = Math.round(manual);
        } else {
            out[period] = Math.round(
                monthly * (PERIOD_HOURS[period] / PERIOD_HOURS.monthly) * PERIOD_PREMIUM[period]
            );
        }
    }
    return out;
}

/** Effective credits-per-hour burn rate for a plan (used by forecasts). */
export function hourlyBurnRate(plan: PlanConfig): number {
    return resolvePeriodPrices(plan).hourly;
}
