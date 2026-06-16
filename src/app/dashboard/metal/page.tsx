"use client";

import { useState } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Server, Cpu, HardDrive, MemoryStick, Globe, Shield, Clock, Plus } from "lucide-react";

const METAL_TIERS = [
    { name: "BM.Standard.E3", cpu: "AMD EPYC 7543 — 32C/64T", ram: "128 GB DDR4 ECC", storage: "2× 1.92 TB NVMe", network: "2× 25 Gbps", price: "Contact Sales" },
    { name: "BM.Standard.X2", cpu: "Intel Xeon Gold 6338 — 32C/64T", ram: "256 GB DDR4 ECC", storage: "2× 3.84 TB NVMe", network: "2× 25 Gbps", price: "Contact Sales" },
    { name: "BM.GPU.A100", cpu: "AMD EPYC 7763 — 64C/128T", ram: "512 GB DDR4 ECC", storage: "4× 3.84 TB NVMe + NVIDIA A100 80GB", network: "2× 100 Gbps", price: "Contact Sales" },
];

export default function BareMetalPage() {
    const t = useThemeTokens();
    const [selectedTier, setSelectedTier] = useState<string | null>(null);

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Dashboard <span style={{ color: t.textMuted }}>&bull;</span> Compute <span style={{ color: t.textMuted }}>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Bare Metal</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Server style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Bare Metal Servers</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Dedicated physical servers with full hardware access. No hypervisor overhead.</p>
                        </div>
                    </div>
                    <span style={{ padding: "6px 14px", borderRadius: t.cardRadius, background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`, color: t.statusWarning, fontSize: "0.78rem", fontWeight: 700 }}>
                        COMING SOON
                    </span>
                </div>
            </div>

            {/* Tier Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {METAL_TIERS.map(tier => (
                    <div key={tier.name} style={{ ...card, padding: 0, overflow: "hidden", cursor: "pointer", borderColor: selectedTier === tier.name ? `${t.accentPrimary}55` : t.borderPrimary, transition: "border-color 0.15s" }} onClick={() => setSelectedTier(selectedTier === tier.name ? null : tier.name)}>
                        <div style={{ padding: "22px 28px", display: "grid", gridTemplateColumns: "200px 1fr 1fr 1fr 140px", alignItems: "center", gap: 16 }}>
                            <div>
                                <p style={{ fontWeight: 800, color: selectedTier === tier.name ? t.accentPrimary : t.textPrimary, fontSize: "1rem", fontFamily: t.fontMono }}>{tier.name}</p>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Cpu style={{ width: 14, height: 14, color: t.textMuted, flexShrink: 0 }} />
                                <span style={{ fontSize: "0.85rem", color: t.textSecondary }}>{tier.cpu}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <MemoryStick style={{ width: 14, height: 14, color: t.textMuted, flexShrink: 0 }} />
                                <span style={{ fontSize: "0.85rem", color: t.textSecondary }}>{tier.ram}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <HardDrive style={{ width: 14, height: 14, color: t.textMuted, flexShrink: 0 }} />
                                <span style={{ fontSize: "0.85rem", color: t.textSecondary }}>{tier.storage}</span>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: t.accentPrimary }}>{tier.price}</span>
                            </div>
                        </div>
                        {selectedTier === tier.name && (
                            <div style={{ padding: "20px 28px", borderTop: `1px solid ${t.borderSecondary}`, background: t.bgSecondary }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 20 }}>
                                    {[
                                        { Icon: Globe, label: "Network", value: tier.network },
                                        { Icon: Shield, label: "Security", value: "Hardware RAID + IPMI" },
                                        { Icon: Clock, label: "Provisioning", value: "24–48 hours" },
                                        { Icon: HardDrive, label: "Bandwidth", value: "Unmetered" },
                                    ].map(spec => (
                                        <div key={spec.label}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                                <spec.Icon style={{ width: 12, height: 12, color: t.textMuted }} />
                                                <span style={{ fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{spec.label}</span>
                                            </div>
                                            <span style={{ fontSize: "0.875rem", color: t.textPrimary, fontWeight: 600 }}>{spec.value}</span>
                                        </div>
                                    ))}
                                </div>
                                <button disabled style={{ padding: "10px 28px", borderRadius: t.buttonRadius, border: "none", background: t.textMuted, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: "not-allowed", display: "flex", alignItems: "center", gap: 8 }}>
                                    <Plus style={{ width: 14, height: 14 }} /> Request Quote
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Info Banner */}
            <div style={{ ...card, marginTop: 20, padding: "20px 24px", display: "flex", alignItems: "center", gap: 14 }}>
                <Shield style={{ width: 20, height: 20, color: t.accentPrimary, flexShrink: 0 }} />
                <div>
                    <p style={{ fontSize: "0.875rem", color: t.textSecondary }}>
                        Bare metal servers are provisioned manually after payment confirmation. Typical lead time is 24–48 hours. All servers include IPMI/BMC out-of-band management and hardware RAID controllers.
                    </p>
                </div>
            </div>
        </div>
    );
}
