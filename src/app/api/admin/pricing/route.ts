import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { PLAN_CONFIGS } from "@/lib/plan-config";
import { resolvePeriodPrices } from "@/lib/billing-periods";
import {
    getServerPlanConfigs,
    savePricingOverrides,
    getUsdtExchangeRate,
    setUsdtExchangeRate,
    getRequiredConfirmations,
    setRequiredConfirmations,
    type PricingOverrides,
    type ConfirmationConfig,
} from "@/lib/pricing-config";

/**
 * GET /api/admin/pricing
 * Returns current plan configs (static + DB overrides), exchange rate, and confirmation settings.
 * Public endpoint — pricing data is non-sensitive.
 */
export async function GET() {
    try {
        const plans = await getServerPlanConfigs();
        const exchangeRate = await getUsdtExchangeRate();
        const confirmations = await getRequiredConfirmations();

        // Attach resolved hourly/daily/weekly/monthly prices per plan
        const plansWithPeriods = Object.fromEntries(
            Object.entries(plans).map(([name, cfg]) => [
                name,
                { ...cfg, resolvedPeriodPrices: resolvePeriodPrices(cfg) },
            ])
        );

        return NextResponse.json({
            plans: plansWithPeriods,
            exchangeRate,
            confirmations,
        });
    } catch (error) {
        console.error("[admin/pricing] GET error:", error);
        return NextResponse.json({ error: "Failed to load pricing" }, { status: 500 });
    }
}

/**
 * PUT /api/admin/pricing
 * Update pricing overrides, exchange rate, and/or confirmation settings.
 * Admin-only endpoint.
 *
 * Body variants:
 *   { action: "update_plan", planName: string, updates: Partial<PlanConfig> }
 *   { action: "update_exchange_rate", rate: number }
 *   { action: "update_confirmations", confirmations: { TRC20: number, ERC20: number } }
 */
export async function PUT(req: NextRequest) {
    const { userId, error } = await requireAdmin();
    if (error) return error;

    try {
        const body = await req.json();
        const { action } = body;

        if (action === "update_plan") {
            const { planName, updates } = body as {
                planName: string;
                updates: Record<string, unknown>;
            };

            if (!planName || !updates) {
                return NextResponse.json(
                    { error: "planName and updates are required" },
                    { status: 400 }
                );
            }

            if (!(planName in PLAN_CONFIGS)) {
                return NextResponse.json(
                    { error: `Unknown plan: "${planName}"` },
                    { status: 400 }
                );
            }

            // Validate manual period prices if supplied.
            // Only HOURLY is a real, pinnable price — daily/weekly/monthly
            // are derived forecasts and must not be set directly.
            if (updates.periodPrices !== undefined) {
                const pp = updates.periodPrices as Record<string, unknown>;
                if (typeof pp !== "object" || pp === null ||
                    Object.entries(pp).some(([k, v]) =>
                        k !== "hourly" || typeof v !== "number" || v < 0 || !Number.isFinite(v))) {
                    return NextResponse.json(
                        { error: "periodPrices may only pin { hourly: number ≥ 0 } — other periods are forecast-derived" },
                        { status: 400 }
                    );
                }
            }

            // Load existing overrides, merge the new change, save back
            const current = await getServerPlanConfigs();
            const existingOverrides: PricingOverrides = {};

            // Reconstruct overrides by diffing current against static defaults
            for (const [name, config] of Object.entries(current)) {
                const staticConfig = PLAN_CONFIGS[name];
                if (!staticConfig) continue;
                const diff: Record<string, unknown> = {};
                for (const [key, val] of Object.entries(config)) {
                    if (JSON.stringify(val) !== JSON.stringify(staticConfig[key as keyof typeof staticConfig])) {
                        diff[key] = val;
                    }
                }
                if (Object.keys(diff).length > 0) {
                    existingOverrides[name] = diff;
                }
            }

            // Apply the new update
            existingOverrides[planName] = {
                ...(existingOverrides[planName] ?? {}),
                ...updates,
            };

            await savePricingOverrides(existingOverrides);

            void audit({
                userId,
                action: "ADMIN_PRICING_CHANGE",
                resourceType: "Pricing",
                resourceId: planName,
                metadata: { planName, updates },
                req,
            });

            return NextResponse.json({ success: true, plan: planName });
        }

        if (action === "update_exchange_rate") {
            const { rate } = body as { rate: number };
            if (typeof rate !== "number" || rate <= 0) {
                return NextResponse.json(
                    { error: "rate must be a positive number" },
                    { status: 400 }
                );
            }

            const oldRate = await getUsdtExchangeRate();
            await setUsdtExchangeRate(rate);

            void audit({
                userId,
                action: "ADMIN_PRICING_CHANGE",
                resourceType: "Pricing",
                resourceId: "exchange_rate",
                metadata: { oldRate, newRate: rate },
                req,
            });

            return NextResponse.json({ success: true, exchangeRate: rate });
        }

        if (action === "update_confirmations") {
            const { confirmations } = body as { confirmations: ConfirmationConfig };
            if (
                typeof confirmations?.TRC20 !== "number" ||
                typeof confirmations?.ERC20 !== "number"
            ) {
                return NextResponse.json(
                    { error: "confirmations.TRC20 and confirmations.ERC20 are required" },
                    { status: 400 }
                );
            }

            const oldConfig = await getRequiredConfirmations();
            await setRequiredConfirmations(confirmations);

            void audit({
                userId,
                action: "ADMIN_PRICING_CHANGE",
                resourceType: "Pricing",
                resourceId: "confirmation_counts",
                metadata: { old: oldConfig, new: confirmations },
                req,
            });

            return NextResponse.json({ success: true, confirmations });
        }

        return NextResponse.json(
            { error: "Invalid action. Use: update_plan, update_exchange_rate, update_confirmations" },
            { status: 400 }
        );
    } catch (error) {
        console.error("[admin/pricing] PUT error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Update failed" },
            { status: 500 }
        );
    }
}
