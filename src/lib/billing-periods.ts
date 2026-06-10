/**
 * Billing Period Math — hourly-anchored
 *
 * The platform bills HOURLY only (metered by /api/billing/cycle). The
 * hourly rate is the single real price:
 *
 *   hourly = plan.periodPrices.hourly (admin-pinned)
 *          ?? plan.priceInCredits / 720   (legacy monthly anchor ÷ 720h)
 *
 * Daily / weekly / monthly are NOT charges — they are forecast values
 * derived from the hourly rate (hourly × 24 / 168 / 720) for display in
 * pricing pages and the user's usage forecast.
 */

import type { PlanConfig } from "@/lib/plan-config";

export type BillingPeriod = "hourly" | "daily" | "weekly" | "monthly";

export const PERIOD_HOURS: Record<BillingPeriod, number> = {
    hourly: 1,
    daily: 24,
    weekly: 168,
    monthly: 720,
};

export type PeriodPrices = Record<BillingPeriod, number>;

/** The one real price: credits charged per hour of VM runtime. */
export function hourlyBurnRate(plan: PlanConfig): number {
    const pinned = plan.periodPrices?.hourly;
    if (typeof pinned === "number" && pinned >= 0) return Math.round(pinned);
    return Math.round(plan.priceInCredits / PERIOD_HOURS.monthly);
}

/**
 * Hourly rate + pure forecasts for the other periods.
 * Only `hourly` is ever charged; the rest are projections.
 */
export function resolvePeriodPrices(plan: PlanConfig): PeriodPrices {
    const hourly = hourlyBurnRate(plan);
    return {
        hourly,
        daily: hourly * PERIOD_HOURS.daily,
        weekly: hourly * PERIOD_HOURS.weekly,
        monthly: hourly * PERIOD_HOURS.monthly,
    };
}
