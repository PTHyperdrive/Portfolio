"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    DollarSign, RefreshCw, CheckCircle2, X, AlertCircle, Loader2,
    Cpu, Save, Settings2, Link2, Zap, HardDrive, Wifi, ShieldCheck,
    Tag, Ticket, Plus, Trash2, Copy, Power,
} from "lucide-react";

/* ── Types ────────────────────────────────────────────────────── */

interface PlanData {
    vcpu: number;
    ramMb: number;
    diskGb: number;
    bandwidthMbits: number;
    storageKeyword: string;
    defaultOs: string;
    priceInCredits: number;
    requiresGpu: boolean;
    periodPrices?: { hourly?: number };
    resolvedPeriodPrices?: { hourly: number; daily: number; weekly: number; monthly: number };
}

interface PricingState {
    plans: Record<string, PlanData>;
    exchangeRate: number;
    confirmations: { TRC20: number; ERC20: number };
}

interface PromoData {
    id: string; code: string; creditValue: number; maxUses: number;
    currentUses: number; expiresAt: string | null; createdAt: string;
    appliedToUsers: { userId: string; appliedAt: string }[];
}

interface InviteData {
    id: string; code: string; maxUses: number; usedCount: number;
    active: boolean; expiresAt: string | null; createdAt: string;
    creator: { id: string; name: string | null; email: string };
    redemptions: { userId: string; redeemedAt: string; context: string }[];
}

/* ── Component ────────────────────────────────────────────────── */

export default function AdminPricingPage() {
    const t = useThemeTokens();
    const [data, setData] = useState<PricingState | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    /* Exchange rate + confirmations local state */
    const [editRate, setEditRate] = useState(26305);
    const [editConfTrc, setEditConfTrc] = useState(1);
    const [editConfErc, setEditConfErc] = useState(3);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/pricing");
            if (!res.ok) throw new Error("Failed to load pricing data");
            const d: PricingState = await res.json();
            setData(d);
            setEditRate(d.exchangeRate);
            setEditConfTrc(d.confirmations.TRC20);
            setEditConfErc(d.confirmations.ERC20);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    /* ── Promo state ──────────────────────────────────────────── */
    const [promos, setPromos] = useState<PromoData[]>([]);
    const [promoLoading, setPromoLoading] = useState(false);
    const [promoForm, setPromoForm] = useState({ code: "", creditValue: 0, maxUses: 1, expiresAt: "" });
    const [promoSaving, setPromoSaving] = useState(false);

    const loadPromos = useCallback(async () => {
        setPromoLoading(true);
        try {
            const res = await fetch("/api/admin/promo");
            if (res.ok) { const d = await res.json(); setPromos(d.codes ?? []); }
        } catch { /* silent */ }
        finally { setPromoLoading(false); }
    }, []);

    useEffect(() => { loadPromos(); }, [loadPromos]);

    const createPromo = async () => {
        if (!promoForm.code || promoForm.creditValue <= 0) return;
        setPromoSaving(true);
        try {
            const res = await fetch("/api/admin/promo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: promoForm.code,
                    creditValue: promoForm.creditValue,
                    maxUses: promoForm.maxUses || 1,
                    expiresAt: promoForm.expiresAt || undefined,
                }),
            });
            if (res.ok) {
                showSuccess(`Promo code "${promoForm.code}" created`);
                setPromoForm({ code: "", creditValue: 0, maxUses: 1, expiresAt: "" });
                loadPromos();
            } else {
                const d = await res.json();
                setError(d.error || "Failed to create");
            }
        } catch { setError("Failed to create promo"); }
        finally { setPromoSaving(false); }
    };

    const deletePromo = async (id: string) => {
        try {
            const res = await fetch("/api/admin/promo", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            if (res.ok) { showSuccess("Promo code deleted"); loadPromos(); }
        } catch { setError("Delete failed"); }
    };

    /* ── Invitation state ─────────────────────────────────────── */
    const [invites, setInvites] = useState<InviteData[]>([]);
    const [inviteLoading, setInviteLoading] = useState(false);

    const loadInvites = useCallback(async () => {
        setInviteLoading(true);
        try {
            const res = await fetch("/api/admin/invitations");
            if (res.ok) { const d = await res.json(); setInvites(d.codes ?? []); }
        } catch { /* silent */ }
        finally { setInviteLoading(false); }
    }, []);

    useEffect(() => { loadInvites(); }, [loadInvites]);

    const toggleInviteActive = async (id: string, active: boolean) => {
        try {
            const res = await fetch("/api/admin/invitations", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, active: !active }),
            });
            if (res.ok) {
                setInvites(prev => prev.map(c => c.id === id ? { ...c, active: !active } : c));
            }
        } catch { /* silent */ }
    };

    /* ── Save helpers ─────────────────────────────────────────── */

    const showSuccess = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(""), 3000);
    };

    const savePlan = async (name: string, updates: Partial<PlanData>) => {
        setSaving(`plan-${name}`);
        setError("");
        try {
            const res = await fetch("/api/admin/pricing", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "update_plan", planName: name, updates }),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || "Failed");
            }
            showSuccess(`Updated "${name}" pricing`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(null);
        }
    };

    const saveExchangeRate = async () => {
        setSaving("rate");
        setError("");
        try {
            const res = await fetch("/api/admin/pricing", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "update_exchange_rate", rate: editRate }),
            });
            if (!res.ok) throw new Error("Failed");
            showSuccess("Exchange rate updated");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(null);
        }
    };

    const saveConfirmations = async () => {
        setSaving("conf");
        setError("");
        try {
            const res = await fetch("/api/admin/pricing", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "update_confirmations",
                    confirmations: { TRC20: editConfTrc, ERC20: editConfErc },
                }),
            });
            if (!res.ok) throw new Error("Failed");
            showSuccess("Confirmation settings updated");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(null);
        }
    };

    const updatePlan = (name: string, field: keyof PlanData, value: number | boolean | string) => {
        if (!data) return;
        setData({
            ...data,
            plans: {
                ...data.plans,
                [name]: { ...data.plans[name], [field]: value },
            },
        });
    };

    /** Edit the pinned hourly rate locally; forecasts re-derive on render. */
    const updateHourly = (name: string, hourly: number) => {
        if (!data) return;
        const plan = data.plans[name];
        setData({
            ...data,
            plans: {
                ...data.plans,
                [name]: {
                    ...plan,
                    periodPrices: { ...plan.periodPrices, hourly },
                    resolvedPeriodPrices: {
                        hourly,
                        daily: hourly * 24,
                        weekly: hourly * 168,
                        monthly: hourly * 720,
                    },
                },
            },
        });
    };

    /* ── Styles ───────────────────────────────────────────────── */

    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };
    const inp: React.CSSProperties = {
        background: t.bgInput,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.isMono ? 4 : 6,
        color: t.textPrimary,
        fontSize: "0.82rem",
        outline: "none",
        padding: "5px 9px",
        fontFamily: t.fontMono,
        width: 110,
    };
    const thStyle: React.CSSProperties = {
        padding: "10px 14px",
        textAlign: "left" as const,
        fontSize: "0.68rem",
        fontWeight: 700,
        color: t.textMuted,
        textTransform: "uppercase" as const,
        letterSpacing: "0.07em",
        borderBottom: `1px solid ${t.borderSecondary}`,
        whiteSpace: "nowrap" as const,
    };
    const tdStyle: React.CSSProperties = {
        padding: "10px 14px",
        borderBottom: `1px solid ${t.borderSecondary}`,
        fontSize: "0.84rem",
        color: t.textSecondary,
    };
    const btnSave: React.CSSProperties = {
        padding: "5px 14px",
        borderRadius: t.buttonRadius,
        border: "none",
        background: t.accentPrimary,
        color: t.textInverse,
        fontWeight: 700,
        fontSize: "0.78rem",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 5,
    };
    const sectionHeader: React.CSSProperties = {
        padding: "14px 18px",
        borderBottom: `1px solid ${t.borderSecondary}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 4 }}>
                    Admin System &bull; Pricing &amp; Promo
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: t.statusWarningBg,
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <DollarSign style={{ width: 20, height: 20, color: t.statusWarning }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>
                                Pricing &amp; Promo
                            </h1>
                            <p style={{ fontSize: "0.82rem", color: t.textMuted }}>
                                Edit VPS tier pricing, exchange rates, and crypto confirmation settings.
                            </p>
                        </div>
                </div>
                <button
                    onClick={load}
                    style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "7px 14px", borderRadius: t.isMono ? 4 : 8,
                        border: `1px solid ${t.borderPrimary}`,
                        background: "transparent", color: t.textMuted,
                        fontSize: "0.8rem", cursor: "pointer",
                    }}
                >
                    <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                </button>
            </div>
        </div>

            {/* Toasts */ }
    {
        success && (
            <div style={{
                padding: "10px 16px", borderRadius: t.isMono ? 4 : 8,
                background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`,
                color: t.statusSuccess, marginBottom: 16, fontSize: "0.875rem",
                display: "flex", alignItems: "center", gap: 8,
            }}>
                <CheckCircle2 style={{ width: 14, height: 14 }} />{success}
            </div>
        )
    }
    {
        error && (
            <div style={{
                padding: "10px 16px", borderRadius: t.isMono ? 4 : 8,
                background: t.statusErrorBg, border: `1px solid ${t.statusError}33`,
                color: t.statusError, marginBottom: 16, fontSize: "0.875rem",
                display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertCircle style={{ width: 14, height: 14 }} />{error}
                </span>
                <button
                    onClick={() => setError("")}
                    style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex" }}
                >
                    <X style={{ width: 13, height: 13 }} />
                </button>
            </div>
        )
    }

    {
        loading ? (
            <div style={{
                padding: "60px", textAlign: "center", color: t.textMuted,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}>
                <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
                Loading pricing data...
            </div>
        ) : data ? (
            <>
                {/* ── VPS Pricing Tiers ────────────────────────── */}
                <div style={{ ...card, marginBottom: 20 }}>
                    <div style={sectionHeader}>
                        <Cpu style={{ width: 16, height: 16, color: t.accentPrimary }} />
                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>
                            VPS Pricing Tiers
                        </span>
                        <span style={{
                            marginLeft: "auto", padding: "2px 8px", borderRadius: 6,
                            background: t.accentPrimaryMuted, color: t.accentPrimary,
                            fontSize: "0.68rem", fontWeight: 700,
                        }}>
                            {Object.keys(data.plans).length} tiers
                        </span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ background: t.bgSecondary }}>
                                    {["Plan", "vCPU", "RAM (MB)", "Disk (GB)", "BW (Mbit/s)", "Storage", "Hourly (Credits/h)", "Day / Week / Month (forecast)", "GPU", "Action"].map(h => (
                                        <th key={h} style={thStyle}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(data.plans).map(([name, plan]) => (
                                    <tr key={name}>
                                        <td style={tdStyle}>
                                            <span style={{ fontWeight: 700, color: t.textPrimary }}>{name}</span>
                                        </td>
                                        <td style={{ ...tdStyle, fontFamily: t.fontMono }}>{plan.vcpu}</td>
                                        <td style={{ ...tdStyle, fontFamily: t.fontMono }}>{plan.ramMb.toLocaleString()}</td>
                                        <td style={{ ...tdStyle, fontFamily: t.fontMono }}>{plan.diskGb}</td>
                                        <td style={{ ...tdStyle, fontFamily: t.fontMono }}>
                                            {plan.bandwidthMbits === 0 ? (
                                                <span style={{ color: t.statusSuccess, fontWeight: 600 }}>Unlimited</span>
                                            ) : plan.bandwidthMbits}
                                        </td>
                                        <td style={{ ...tdStyle, fontSize: "0.78rem" }}>{plan.storageKeyword.toUpperCase()}</td>
                                        <td style={tdStyle}>
                                            <input
                                                type="number"
                                                value={plan.resolvedPeriodPrices?.hourly ?? 0}
                                                onChange={e => updateHourly(name, parseInt(e.target.value) || 0)}
                                                style={inp}
                                            />
                                        </td>
                                        <td style={{ ...tdStyle, fontFamily: t.fontMono, fontSize: "0.76rem", color: t.textMuted }}>
                                            {(plan.resolvedPeriodPrices?.daily ?? 0).toLocaleString()}
                                            {" / "}{(plan.resolvedPeriodPrices?.weekly ?? 0).toLocaleString()}
                                            {" / "}{(plan.resolvedPeriodPrices?.monthly ?? 0).toLocaleString()}
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{
                                                padding: "2px 8px", borderRadius: 4, fontSize: "0.7rem", fontWeight: 700,
                                                background: plan.requiresGpu ? `${t.accentSecondary}18` : `${t.textMuted}18`,
                                                color: plan.requiresGpu ? t.accentSecondary : t.textMuted,
                                            }}>
                                                {plan.requiresGpu ? "Yes" : "No"}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            <button
                                                onClick={() => savePlan(name, { periodPrices: { hourly: plan.resolvedPeriodPrices?.hourly ?? 0 } })}
                                                disabled={saving === `plan-${name}`}
                                                style={btnSave}
                                            >
                                                {saving === `plan-${name}` ? (
                                                    <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
                                                ) : (
                                                    <Save style={{ width: 11, height: 11 }} />
                                                )}
                                                Save
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── Two-column config cards ──────────────────── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {/* USDT Exchange Rate */}
                    <div style={card}>
                        <div style={sectionHeader}>
                            <Link2 style={{ width: 16, height: 16, color: t.statusWarning }} />
                            <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>
                                USDT Exchange Rate
                            </span>
                        </div>
                        <div style={{ padding: "18px 18px 14px" }}>
                            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 12 }}>
                                Credits minted per 1 USDT. Based on VND exchange rate.
                            </p>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                <span style={{ fontSize: "0.82rem", color: t.textSecondary, fontWeight: 600 }}>
                                    1 USDT =
                                </span>
                                <input
                                    type="number"
                                    value={editRate}
                                    onChange={e => setEditRate(parseFloat(e.target.value) || 0)}
                                    style={{ ...inp, width: 130 }}
                                />
                                <span style={{ fontSize: "0.82rem", color: t.textMuted }}>Credits</span>
                            </div>
                            <div style={{
                                padding: "8px 12px", borderRadius: t.isMono ? 4 : 6,
                                background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`,
                                fontSize: "0.75rem", color: t.textMuted, marginBottom: 14,
                                fontFamily: t.fontMono,
                            }}>
                                Example: 10 USDT = {(editRate * 10).toLocaleString()} Credits
                            </div>
                            <button
                                onClick={saveExchangeRate}
                                disabled={saving === "rate"}
                                style={{ ...btnSave, width: "100%", justifyContent: "center", padding: "8px 14px" }}
                            >
                                {saving === "rate" ? (
                                    <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
                                ) : (
                                    <Save style={{ width: 12, height: 12 }} />
                                )}
                                Save Exchange Rate
                            </button>
                        </div>
                    </div>

                    {/* Blockchain Confirmations */}
                    <div style={card}>
                        <div style={sectionHeader}>
                            <ShieldCheck style={{ width: 16, height: 16, color: t.statusSuccess }} />
                            <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>
                                Blockchain Confirmations
                            </span>
                        </div>
                        <div style={{ padding: "18px 18px 14px" }}>
                            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 12 }}>
                                Required confirmations before minting credits per chain.
                            </p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{
                                        fontSize: "0.78rem", fontWeight: 700, color: t.textSecondary,
                                        minWidth: 70,
                                    }}>
                                        TRC-20
                                    </span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={editConfTrc}
                                        onChange={e => setEditConfTrc(parseInt(e.target.value) || 1)}
                                        style={{ ...inp, width: 80 }}
                                    />
                                    <span style={{ fontSize: "0.72rem", color: t.textMuted }}>confirmations</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{
                                        fontSize: "0.78rem", fontWeight: 700, color: t.textSecondary,
                                        minWidth: 70,
                                    }}>
                                        ERC-20
                                    </span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={editConfErc}
                                        onChange={e => setEditConfErc(parseInt(e.target.value) || 1)}
                                        style={{ ...inp, width: 80 }}
                                    />
                                    <span style={{ fontSize: "0.72rem", color: t.textMuted }}>confirmations</span>
                                </div>
                            </div>
                            <button
                                onClick={saveConfirmations}
                                disabled={saving === "conf"}
                                style={{ ...btnSave, width: "100%", justifyContent: "center", padding: "8px 14px" }}
                            >
                                {saving === "conf" ? (
                                    <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
                                ) : (
                                    <Save style={{ width: 12, height: 12 }} />
                                )}
                                Save Confirmation Settings
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Info banner ──────────────────────────────── */}
                <div style={{
                    marginTop: 20,
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 20px", borderRadius: t.isMono ? 4 : 8,
                    background: t.accentPrimaryMuted,
                    border: `1px solid ${t.accentPrimary}33`,
                    color: t.accentPrimary, fontSize: "0.82rem",
                }}>
                    <Zap style={{ width: 14, height: 14, flexShrink: 0 }} />
                    <span>
                        Price changes propagate instantly to public VPS pricing pages
                        and the credit deduction system. All modifications are logged in the audit trail.
                    </span>
                </div>

                {/* ── Promo Codes ────────────────────────────── */}
                <div style={{ ...card, marginTop: 20 }}>
                    <div style={sectionHeader}>
                        <Tag style={{ width: 16, height: 16, color: t.accentSecondary }} />
                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>
                            Promo Codes
                        </span>
                        <span style={{
                            marginLeft: "auto", padding: "2px 8px", borderRadius: 6,
                            background: `${t.accentSecondary}18`, color: t.accentSecondary,
                            fontSize: "0.68rem", fontWeight: 700,
                        }}>
                            {promos.length} codes
                        </span>
                    </div>

                    {/* Create Promo Form */}
                    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
                        <div>
                            <label style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 3 }}>CODE</label>
                            <input value={promoForm.code} onChange={e => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} placeholder="SUMMER25" style={{ ...inp, width: 130, textTransform: "uppercase" }} />
                        </div>
                        <div>
                            <label style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 3 }}>CREDITS</label>
                            <input type="number" value={promoForm.creditValue || ""} onChange={e => setPromoForm({ ...promoForm, creditValue: parseInt(e.target.value) || 0 })} placeholder="5000" style={{ ...inp, width: 100 }} />
                        </div>
                        <div>
                            <label style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 3 }}>MAX USES</label>
                            <input type="number" min={1} value={promoForm.maxUses} onChange={e => setPromoForm({ ...promoForm, maxUses: parseInt(e.target.value) || 1 })} style={{ ...inp, width: 70 }} />
                        </div>
                        <div>
                            <label style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 3 }}>EXPIRES</label>
                            <input type="date" value={promoForm.expiresAt} onChange={e => setPromoForm({ ...promoForm, expiresAt: e.target.value })} style={{ ...inp, width: 140 }} />
                        </div>
                        <button onClick={createPromo} disabled={promoSaving || !promoForm.code || promoForm.creditValue <= 0} style={{ ...btnSave, opacity: promoSaving || !promoForm.code || promoForm.creditValue <= 0 ? 0.5 : 1 }}>
                            {promoSaving ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 11, height: 11 }} />}
                            Create
                        </button>
                    </div>

                    {/* Promo Table */}
                    {promoLoading ? (
                        <div style={{ padding: "30px", textAlign: "center", color: t.textMuted, fontSize: "0.82rem" }}>Loading promo codes...</div>
                    ) : promos.length === 0 ? (
                        <div style={{ padding: "30px", textAlign: "center", color: t.textMuted, fontSize: "0.82rem" }}>No promo codes yet.</div>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ background: t.bgSecondary }}>
                                        {["Code", "Credits", "Used / Max", "Expires", "Status", "Action"].map(h => (
                                            <th key={h} style={thStyle}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {promos.map(p => {
                                        const isExpired = p.expiresAt && new Date(p.expiresAt) < new Date();
                                        const isExhausted = p.currentUses >= p.maxUses;
                                        return (
                                            <tr key={p.id}>
                                                <td style={{ ...tdStyle, fontFamily: t.fontMono, fontWeight: 700, color: t.textPrimary, letterSpacing: "0.04em" }}>{p.code}</td>
                                                <td style={{ ...tdStyle, fontFamily: t.fontMono, color: t.statusSuccess }}>{p.creditValue.toLocaleString()}</td>
                                                <td style={tdStyle}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <div style={{ width: 60, height: 6, borderRadius: 3, background: `${t.textMuted}20`, overflow: "hidden" }}>
                                                            <div style={{ width: `${Math.min(100, (p.currentUses / p.maxUses) * 100)}%`, height: "100%", borderRadius: 3, background: isExhausted ? t.statusError : t.accentPrimary }} />
                                                        </div>
                                                        <span style={{ fontSize: "0.78rem", fontFamily: t.fontMono, color: t.textSecondary }}>{p.currentUses}/{p.maxUses}</span>
                                                    </div>
                                                </td>
                                                <td style={{ ...tdStyle, fontSize: "0.78rem" }}>{p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "Never"}</td>
                                                <td style={tdStyle}>
                                                    <span style={{
                                                        padding: "2px 8px", borderRadius: 4, fontSize: "0.68rem", fontWeight: 700,
                                                        background: isExpired || isExhausted ? t.statusErrorBg : t.statusSuccessBg,
                                                        color: isExpired || isExhausted ? t.statusError : t.statusSuccess,
                                                    }}>
                                                        {isExpired ? "Expired" : isExhausted ? "Exhausted" : "Active"}
                                                    </span>
                                                </td>
                                                <td style={tdStyle}>
                                                    <button onClick={() => deletePromo(p.id)} style={{ background: "none", border: "none", color: t.statusError, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem" }}>
                                                        <Trash2 style={{ width: 12, height: 12 }} /> Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── Invitation Codes Overview ──────────────── */}
                <div style={{ ...card, marginTop: 20 }}>
                    <div style={sectionHeader}>
                        <Ticket style={{ width: 16, height: 16, color: t.statusSuccess }} />
                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>
                            Invitation Codes
                        </span>
                        <span style={{
                            marginLeft: "auto", padding: "2px 8px", borderRadius: 6,
                            background: t.statusSuccessBg, color: t.statusSuccess,
                            fontSize: "0.68rem", fontWeight: 700,
                        }}>
                            {invites.length} codes
                        </span>
                        <button onClick={loadInvites} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.72rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
                            <RefreshCw style={{ width: 10, height: 10 }} />
                        </button>
                    </div>

                    {inviteLoading ? (
                        <div style={{ padding: "30px", textAlign: "center", color: t.textMuted, fontSize: "0.82rem" }}>Loading invitation codes...</div>
                    ) : invites.length === 0 ? (
                        <div style={{ padding: "30px", textAlign: "center", color: t.textMuted, fontSize: "0.82rem" }}>No invitation codes generated by users yet.</div>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ background: t.bgSecondary }}>
                                        {["Code", "Creator", "Used / Max", "Expires", "Status", "Action"].map(h => (
                                            <th key={h} style={thStyle}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {invites.map(inv => {
                                        const isExpired = inv.expiresAt && new Date(inv.expiresAt) < new Date();
                                        const isExhausted = inv.usedCount >= inv.maxUses;
                                        const pct = Math.min(100, (inv.usedCount / inv.maxUses) * 100);
                                        return (
                                            <tr key={inv.id}>
                                                <td style={{ ...tdStyle, fontFamily: t.fontMono, fontWeight: 700, color: t.textPrimary, letterSpacing: "0.04em" }}>{inv.code}</td>
                                                <td style={{ ...tdStyle, fontSize: "0.78rem" }}>
                                                    <div style={{ display: "flex", flexDirection: "column" }}>
                                                        <span style={{ color: t.textPrimary, fontWeight: 600 }}>{inv.creator.name || "--"}</span>
                                                        <span style={{ color: t.textMuted, fontSize: "0.72rem" }}>{inv.creator.email}</span>
                                                    </div>
                                                </td>
                                                <td style={tdStyle}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <div style={{ width: 60, height: 6, borderRadius: 3, background: `${t.textMuted}20`, overflow: "hidden" }}>
                                                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: isExhausted ? t.statusError : t.statusSuccess, transition: "width 0.3s" }} />
                                                        </div>
                                                        <span style={{ fontSize: "0.78rem", fontFamily: t.fontMono, color: t.textSecondary }}>{inv.usedCount}/{inv.maxUses}</span>
                                                    </div>
                                                </td>
                                                <td style={{ ...tdStyle, fontSize: "0.78rem" }}>{inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "Never"}</td>
                                                <td style={tdStyle}>
                                                    <span style={{
                                                        padding: "2px 8px", borderRadius: 4, fontSize: "0.68rem", fontWeight: 700,
                                                        background: !inv.active ? t.statusErrorBg : isExpired ? t.statusWarningBg : isExhausted ? `${t.textMuted}18` : t.statusSuccessBg,
                                                        color: !inv.active ? t.statusError : isExpired ? t.statusWarning : isExhausted ? t.textMuted : t.statusSuccess,
                                                    }}>
                                                        {!inv.active ? "Disabled" : isExpired ? "Expired" : isExhausted ? "Exhausted" : "Active"}
                                                    </span>
                                                </td>
                                                <td style={tdStyle}>
                                                    <button onClick={() => toggleInviteActive(inv.id, inv.active)} style={{
                                                        background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem",
                                                        color: inv.active ? t.statusError : t.statusSuccess,
                                                    }}>
                                                        <Power style={{ width: 12, height: 12 }} />
                                                        {inv.active ? "Disable" : "Enable"}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </>
        ) : null
    }
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div >
            );
}
