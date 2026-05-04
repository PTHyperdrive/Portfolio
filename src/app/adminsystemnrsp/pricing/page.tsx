"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { DollarSign, RefreshCw, CheckCircle2, X, AlertCircle, Loader2, Cpu, Gpu } from "lucide-react";

interface PricingTier {
    id: number; name: string; vcpu_min: number; vcpu_max: number;
    ram_min_gb: number; ram_max_gb: number; nvme_gb: number;
    rate_per_hour: number; rate_per_month: number;
    target_market: string; is_active: boolean;
}
interface GPUResource {
    id: number; name: string; model: string; vram_gb: number;
    cuda_cores: number; power_watts: number;
    rate_per_hour: number; target_workloads: string;
}

export default function AdminPricingPage() {
    const t = useThemeTokens();
    const [tiers, setTiers] = useState<PricingTier[]>([]);
    const [gpus, setGpus] = useState<GPUResource[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/proxmox/pricing");
            if (!res.ok) throw new Error("Failed to load");
            const d = await res.json();
            setTiers(d.tiers ?? []); setGpus(d.gpus ?? []);
        } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const saveTier = async (tier: PricingTier) => {
        setSaving(`tier-${tier.id}`); setError("");
        try {
            const res = await fetch("/api/proxmox/pricing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "tier", id: tier.id, data: { rate_per_hour: tier.rate_per_hour, rate_per_month: tier.rate_per_month } }) });
            if (!res.ok) throw new Error("Failed");
            setSuccess(`Updated "${tier.name}"`); setTimeout(() => setSuccess(""), 3000);
        } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
        finally { setSaving(null); }
    };

    const saveGpu = async (gpu: GPUResource) => {
        setSaving(`gpu-${gpu.id}`); setError("");
        try {
            const res = await fetch("/api/proxmox/pricing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "gpu", id: gpu.id, data: { rate_per_hour: gpu.rate_per_hour } }) });
            if (!res.ok) throw new Error("Failed");
            setSuccess(`Updated "${gpu.name}" GPU`); setTimeout(() => setSuccess(""), 3000);
        } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
        finally { setSaving(null); }
    };

    const updateTier = (id: number, field: keyof PricingTier, value: number) =>
        setTiers(p => p.map(t => t.id === id ? { ...t, [field]: value } : t));
    const updateGpu = (id: number, field: keyof GPUResource, value: number) =>
        setGpus(p => p.map(g => g.id === id ? { ...g, [field]: value } : g));

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const inp: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.isMono ? 4 : 6, color: t.textPrimary, fontSize: "0.82rem", outline: "none", padding: "5px 9px", fontFamily: t.fontMono, width: 110 };
    const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left" as const, fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}`, whiteSpace: "nowrap" as const };
    const tdStyle: React.CSSProperties = { padding: "10px 14px", borderBottom: `1px solid ${t.borderSecondary}`, fontSize: "0.84rem", color: t.textSecondary };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 4 }}>Admin System &bull; Pricing</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <DollarSign style={{ width: 20, height: 20, color: t.statusWarning }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>Pricing Management</h1>
                            <p style={{ fontSize: "0.82rem", color: t.textMuted }}>Edit VPS tier pricing and GPU resource rates.</p>
                        </div>
                    </div>
                    <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                        <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                    </button>
                </div>
            </div>

            {/* Toasts */}
            {success && <div style={{ padding: "10px 16px", borderRadius: t.isMono ? 4 : 8, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, marginBottom: 16, fontSize: "0.875rem", display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 style={{ width: 14, height: 14 }} />{success}</div>}
            {error && <div style={{ padding: "10px 16px", borderRadius: t.isMono ? 4 : 8, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 16, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ display: "flex", alignItems: "center", gap: 8 }}><AlertCircle style={{ width: 14, height: 14 }} />{error}</span><button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex" }}><X style={{ width: 13, height: 13 }} /></button></div>}

            {loading ? (
                <div style={{ padding: "60px", textAlign: "center", color: t.textMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> Loading pricing data...
                </div>
            ) : (
                <>
                    {/* VPS Tiers */}
                    <div style={{ ...card, marginBottom: 20 }}>
                        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 8 }}>
                            <Cpu style={{ width: 16, height: 16, color: t.accentPrimary }} />
                            <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>VPS Pricing Tiers</span>
                            <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 6, background: t.accentPrimaryMuted, color: t.accentPrimary, fontSize: "0.68rem", fontWeight: 700 }}>{tiers.length} tiers</span>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr style={{ background: t.bgSecondary }}>
                                    {["Tier", "vCPU Range", "RAM Range", "NVMe", "Rate/Hour (VND)", "Rate/Month (VND)", "Market", "Action"].map(h => (
                                        <th key={h} style={thStyle}>{h}</th>
                                    ))}
                                </tr></thead>
                                <tbody>
                                    {tiers.map(tier => (
                                        <tr key={tier.id}>
                                            <td style={tdStyle}><span style={{ fontWeight: 700, color: t.textPrimary }}>{tier.name}</span></td>
                                            <td style={{ ...tdStyle, fontFamily: t.fontMono }}>{tier.vcpu_min}–{tier.vcpu_max}</td>
                                            <td style={{ ...tdStyle, fontFamily: t.fontMono }}>{tier.ram_min_gb}–{tier.ram_max_gb} GB</td>
                                            <td style={{ ...tdStyle, fontFamily: t.fontMono }}>{tier.nvme_gb} GB</td>
                                            <td style={tdStyle}><input type="number" value={tier.rate_per_hour} onChange={e => updateTier(tier.id, "rate_per_hour", parseFloat(e.target.value))} style={inp} /></td>
                                            <td style={tdStyle}><input type="number" value={tier.rate_per_month} onChange={e => updateTier(tier.id, "rate_per_month", parseFloat(e.target.value))} style={inp} /></td>
                                            <td style={{ ...tdStyle, maxWidth: 140, fontSize: "0.75rem" }}>{tier.target_market}</td>
                                            <td style={tdStyle}>
                                                <button onClick={() => saveTier(tier)} disabled={saving === `tier-${tier.id}`} style={{ padding: "5px 14px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                                                    {saving === `tier-${tier.id}` ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} /> : null} Save
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* GPU Resources */}
                    <div style={card}>
                        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 8 }}>
                            <Gpu style={{ width: 16, height: 16, color: t.accentSecondary }} />
                            <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>GPU Resource Pricing</span>
                            <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 6, background: `${t.accentSecondary}18`, color: t.accentSecondary, fontSize: "0.68rem", fontWeight: 700 }}>{gpus.length} GPUs</span>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr style={{ background: t.bgSecondary }}>
                                    {["GPU Name", "Model", "VRAM", "CUDA Cores", "Power", "Rate/Hour (VND)", "Workloads", "Action"].map(h => (
                                        <th key={h} style={thStyle}>{h}</th>
                                    ))}
                                </tr></thead>
                                <tbody>
                                    {gpus.map(gpu => (
                                        <tr key={gpu.id}>
                                            <td style={tdStyle}><span style={{ fontWeight: 700, color: t.textPrimary }}>{gpu.name}</span></td>
                                            <td style={{ ...tdStyle, fontFamily: t.fontMono, fontSize: "0.78rem" }}>{gpu.model}</td>
                                            <td style={{ ...tdStyle, color: t.accentPrimary, fontFamily: t.fontMono }}>{gpu.vram_gb} GB</td>
                                            <td style={{ ...tdStyle, fontFamily: t.fontMono }}>{gpu.cuda_cores?.toLocaleString()}</td>
                                            <td style={{ ...tdStyle, fontFamily: t.fontMono }}>{gpu.power_watts}W</td>
                                            <td style={tdStyle}><input type="number" value={gpu.rate_per_hour} onChange={e => updateGpu(gpu.id, "rate_per_hour", parseFloat(e.target.value))} style={inp} /></td>
                                            <td style={{ ...tdStyle, maxWidth: 140, fontSize: "0.75rem" }}>{gpu.target_workloads}</td>
                                            <td style={tdStyle}>
                                                <button onClick={() => saveGpu(gpu)} disabled={saving === `gpu-${gpu.id}`} style={{ padding: "5px 14px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                                                    {saving === `gpu-${gpu.id}` ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} /> : null} Save
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
