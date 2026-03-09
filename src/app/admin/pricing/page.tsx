"use client";

import { useState, useEffect, useCallback } from "react";

interface PricingTier {
    id: number;
    name: string;
    vcpu_min: number;
    vcpu_max: number;
    ram_min_gb: number;
    ram_max_gb: number;
    nvme_gb: number;
    backup_included: boolean;
    rate_per_hour: number;
    rate_per_month: number;
    target_market: string;
    is_active: boolean;
}

interface GPUResource {
    id: number;
    name: string;
    model: string;
    vram_gb: number;
    cuda_cores: number;
    power_watts: number;
    rate_per_hour: number;
    target_workloads: string;
}

export default function AdminPricingPage() {
    const [tiers, setTiers] = useState<PricingTier[]>([]);
    const [gpus, setGpus] = useState<GPUResource[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const loadData = useCallback(async () => {
        try {
            const res = await fetch("/api/proxmox/pricing");
            if (!res.ok) throw new Error("Failed to load pricing");
            const data = await res.json();
            setTiers(data.tiers || []);
            setGpus(data.gpus || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const saveTier = async (tier: PricingTier) => {
        setSaving(`tier-${tier.id}`);
        setError("");
        try {
            const res = await fetch("/api/proxmox/pricing", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "tier",
                    id: tier.id,
                    data: { rate_per_hour: tier.rate_per_hour, rate_per_month: tier.rate_per_month },
                }),
            });
            if (!res.ok) throw new Error("Failed to update");
            setSuccess(`Updated "${tier.name}" pricing`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Update failed");
        } finally {
            setSaving(null);
        }
    };

    const saveGpu = async (gpu: GPUResource) => {
        setSaving(`gpu-${gpu.id}`);
        setError("");
        try {
            const res = await fetch("/api/proxmox/pricing", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "gpu",
                    id: gpu.id,
                    data: { rate_per_hour: gpu.rate_per_hour },
                }),
            });
            if (!res.ok) throw new Error("Failed to update");
            setSuccess(`Updated "${gpu.name}" GPU pricing`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Update failed");
        } finally {
            setSaving(null);
        }
    };

    const updateTierField = (id: number, field: keyof PricingTier, value: number) => {
        setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
    };

    const updateGpuField = (id: number, field: keyof GPUResource, value: number) => {
        setGpus((prev) => prev.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
    };

    if (loading) {
        return (
            <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "100px" }}>
                <p style={{ color: "var(--text-muted)" }}>Loading pricing data...</p>
            </div>
        );
    }

    return (
        <div style={{ paddingTop: "120px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container">
                <div style={{ marginBottom: "40px" }}>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                        💰 Pricing <span className="gradient-text">Management</span>
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                        Edit pricing tiers and GPU resource rates. Changes are saved to the Proxmox Manager API.
                    </p>
                </div>

                {error && (
                    <div style={{ padding: "14px 20px", borderRadius: "var(--radius-sm)", background: "rgba(255,0,110,0.1)", border: "1px solid rgba(255,0,110,0.2)", color: "var(--accent-magenta)", marginBottom: "20px", fontSize: "0.9rem" }}>
                        {error}
                        <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
                    </div>
                )}
                {success && (
                    <div style={{ padding: "14px 20px", borderRadius: "var(--radius-sm)", background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)", color: "var(--accent-green)", marginBottom: "20px", fontSize: "0.9rem" }}>
                        ✓ {success}
                    </div>
                )}

                {/* Pricing Tiers */}
                <div className="glass-card" style={{ padding: "28px", marginBottom: "28px" }}>
                    <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "20px" }}>📊 VPS Pricing Tiers</h2>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                                    {["Tier", "vCPU", "RAM", "NVMe", "Rate/Hour", "Rate/Month", "Market", ""].map((h) => (
                                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tiers.map((tier) => (
                                    <tr key={tier.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                        <td style={{ padding: "12px", fontWeight: 600, fontSize: "0.9rem" }}>{tier.name}</td>
                                        <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-muted)" }}>{tier.vcpu_min}–{tier.vcpu_max}</td>
                                        <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-muted)" }}>{tier.ram_min_gb}–{tier.ram_max_gb} GB</td>
                                        <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-muted)" }}>{tier.nvme_gb} GB</td>
                                        <td style={{ padding: "12px" }}>
                                            <input
                                                type="number"
                                                value={tier.rate_per_hour}
                                                onChange={(e) => updateTierField(tier.id, "rate_per_hour", parseFloat(e.target.value))}
                                                className="input-field"
                                                style={{ width: "120px", padding: "6px 10px", fontSize: "0.85rem" }}
                                            />
                                        </td>
                                        <td style={{ padding: "12px" }}>
                                            <input
                                                type="number"
                                                value={tier.rate_per_month}
                                                onChange={(e) => updateTierField(tier.id, "rate_per_month", parseFloat(e.target.value))}
                                                className="input-field"
                                                style={{ width: "120px", padding: "6px 10px", fontSize: "0.85rem" }}
                                            />
                                        </td>
                                        <td style={{ padding: "12px", fontSize: "0.82rem", color: "var(--text-muted)", maxWidth: "150px" }}>{tier.target_market}</td>
                                        <td style={{ padding: "12px" }}>
                                            <button
                                                onClick={() => saveTier(tier)}
                                                disabled={saving === `tier-${tier.id}`}
                                                className="btn btn-primary"
                                                style={{ padding: "6px 16px", fontSize: "0.78rem" }}
                                            >
                                                {saving === `tier-${tier.id}` ? "..." : "Save"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {tiers.length === 0 && (
                        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px", fontSize: "0.9rem" }}>
                            No pricing tiers found. Make sure the Proxmox Manager API has been seeded with default data.
                        </p>
                    )}
                </div>

                {/* GPU Resources */}
                <div className="glass-card" style={{ padding: "28px" }}>
                    <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "20px" }}>🎮 GPU Resource Pricing</h2>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                                    {["GPU", "Model", "VRAM", "CUDA", "Power", "Rate/Hour", "Workloads", ""].map((h) => (
                                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {gpus.map((gpu) => (
                                    <tr key={gpu.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                        <td style={{ padding: "12px", fontWeight: 600, fontSize: "0.9rem" }}>{gpu.name}</td>
                                        <td style={{ padding: "12px", fontSize: "0.82rem", color: "var(--text-muted)" }}>{gpu.model}</td>
                                        <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--accent-cyan)" }}>{gpu.vram_gb} GB</td>
                                        <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-muted)" }}>{gpu.cuda_cores?.toLocaleString()}</td>
                                        <td style={{ padding: "12px", fontSize: "0.85rem", color: "var(--text-muted)" }}>{gpu.power_watts}W</td>
                                        <td style={{ padding: "12px" }}>
                                            <input
                                                type="number"
                                                value={gpu.rate_per_hour}
                                                onChange={(e) => updateGpuField(gpu.id, "rate_per_hour", parseFloat(e.target.value))}
                                                className="input-field"
                                                style={{ width: "120px", padding: "6px 10px", fontSize: "0.85rem" }}
                                            />
                                        </td>
                                        <td style={{ padding: "12px", fontSize: "0.82rem", color: "var(--text-muted)", maxWidth: "150px" }}>{gpu.target_workloads}</td>
                                        <td style={{ padding: "12px" }}>
                                            <button
                                                onClick={() => saveGpu(gpu)}
                                                disabled={saving === `gpu-${gpu.id}`}
                                                className="btn btn-primary"
                                                style={{ padding: "6px 16px", fontSize: "0.78rem" }}
                                            >
                                                {saving === `gpu-${gpu.id}` ? "..." : "Save"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {gpus.length === 0 && (
                        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px", fontSize: "0.9rem" }}>
                            No GPU resources found. Seed the Manager API first.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
