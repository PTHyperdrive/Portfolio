"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────

interface VpsInstance {
    id: string;
    vmId: string;
    name: string;
    node: string;
    status: string;
}

interface BlockAddon {
    id: string;
    storageType: string;
    storagePool: string;
    diskSlot: string;
    sizeGb: number;
    pricePerGb: number;
    totalCost: number;
    purchasedAt: string;
}

interface StorageInfo {
    vmId: string;
    node: string;
    addons: BlockAddon[];
    totalExtraGb: number;
    usedSlots: number;
    freeSlots: number;
    limits: { min: number; max: number; step: number };
    pricing: { nvme: number; sata: number; hdd: number };
}

type StorageType = "nvme" | "sata" | "hdd";

const TIER_STYLES: Record<StorageType, { label: string; color: string; bg: string }> = {
    nvme: { label: "NVMe SSD", color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
    sata: { label: "SATA SSD", color: "#38bdf8", bg: "rgba(56,189,248,0.1)"  },
    hdd:  { label: "HDD",      color: "#fb923c", bg: "rgba(251,146,60,0.1)"  },
};

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

// ── Page ───────────────────────────────────────────────────────────

export default function BlockStoragePage() {
    const [vms, setVms] = useState<VpsInstance[]>([]);
    const [selectedVm, setSelectedVm] = useState<string>("");
    const [info, setInfo] = useState<StorageInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [infoLoading, setInfoLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Purchase form
    const [sizeGb, setSizeGb] = useState(50);
    const [storageType, setStorageType] = useState<StorageType>("sata");
    const [submitting, setSubmitting] = useState(false);

    // Load VMs
    useEffect(() => {
        fetch("/api/proxmox/vms?limit=50")
            .then(r => r.json())
            .then(d => {
                const list: VpsInstance[] = d.instances ?? [];
                setVms(list);
                if (list.length > 0) setSelectedVm(list[0].vmId);
            })
            .catch(() => setError("Failed to load VMs."))
            .finally(() => setLoading(false));
    }, []);

    // Load storage info when VM changes
    const loadInfo = useCallback(async (vmId: string) => {
        if (!vmId) return;
        setInfoLoading(true); setInfo(null);
        try {
            const res = await fetch(`/api/vps/${vmId}/storage`);
            if (!res.ok) throw new Error("Failed to load storage.");
            setInfo(await res.json());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed.");
        } finally {
            setInfoLoading(false);
        }
    }, []);

    useEffect(() => { if (selectedVm) loadInfo(selectedVm); }, [selectedVm, loadInfo]);

    const handlePurchase = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true); setError("");
        const res = await fetch(`/api/vps/${selectedVm}/storage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storageType, sizeGb }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Purchase failed."); setSubmitting(false); return; }
        setSuccess(`+${sizeGb} GB ${TIER_STYLES[storageType].label} attached to VM ${selectedVm} (${json.diskSlot})`);
        if (json.manualCommand) {
            setSuccess(prev => `${prev}\n⚠️ Manual attach needed: ${json.manualCommand}`);
        }
        setSizeGb(50);
        loadInfo(selectedVm);
        setSubmitting(false);
    };

    // ── Styles ─────────────────────────────────────────────────────
    const bg = "#0d1117";
    const card: React.CSSProperties = { background: "#161b22", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14 };
    const sel: React.CSSProperties  = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, color: "#e2e8f0", fontSize: "0.875rem", outline: "none", padding: "9px 13px", cursor: "pointer" };

    const cost = info ? (info.pricing[storageType] * sizeGb).toLocaleString() : "—";

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: bg }}>

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: "0.78rem", color: "#475569" }}>Dashboard</span>
                    <span style={{ color: "#334155" }}>•</span>
                    <Link href="/dashboard/storage/nextcloud" style={{ fontSize: "0.78rem", color: "#475569", textDecoration: "none", padding: "2px 10px", borderRadius: 6 }}>
                        Nextcloud
                    </Link>
                    <span style={{ color: "#334155" }}>•</span>
                    <span style={{ fontSize: "0.78rem", color: "#a78bfa", fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: "rgba(167,139,250,0.08)" }}>Block Storage</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                        <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
                        <line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
                    </svg>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f1f5f9" }}>Block Storage</h1>
                </div>
                <p style={{ marginTop: 6, fontSize: "0.83rem", color: "#475569", maxWidth: 520 }}>
                    Attach extra Proxmox disk volumes directly to your VMs (SATA bus).
                    Up to 5 extra disks per VM, 10–2000 GB per disk.
                </p>
            </div>

            {/* Pricing badges */}
            <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
                {(Object.keys(TIER_STYLES) as StorageType[]).map(t => (
                    <div key={t} style={{ padding: "6px 14px", borderRadius: 8, background: TIER_STYLES[t].bg, border: `1px solid ${TIER_STYLES[t].color}33`, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: TIER_STYLES[t].color }}>{TIER_STYLES[t].label}</span>
                        <span style={{ fontSize: "0.72rem", color: "#475569" }}>= 2,000 VND/GB</span>
                    </div>
                ))}
            </div>

            {/* Toasts */}
            {success && (
                <div style={{ padding: "12px 16px", borderRadius: 9, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#10b981", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", whiteSpace: "pre-line" }}>
                    {success}
                    <button onClick={() => setSuccess("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", flexShrink: 0, alignSelf: "flex-start" }}>✕</button>
                </div>
            )}
            {error && (
                <div style={{ padding: "12px 16px", borderRadius: 9, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>
                    {error}
                    <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
                </div>
            )}

            {loading ? (
                <div style={{ padding: 60, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", gap: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
                    </svg>
                    Loading VMs…
                </div>
            ) : vms.length === 0 ? (
                <div style={{ ...card, padding: "40px", textAlign: "center" }}>
                    <p style={{ color: "#475569", marginBottom: 16 }}>No VMs found. Deploy a VM first to attach block storage.</p>
                    <Link href="/dashboard/compute/new" style={{ padding: "10px 24px", borderRadius: 9, textDecoration: "none", background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontWeight: 700, fontSize: "0.875rem" }}>
                        Deploy VM
                    </Link>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* VM selector */}
                    <div style={{ ...card, padding: "20px 24px" }}>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                            Target VM
                        </label>
                        <select id="block-storage-vm-select" value={selectedVm} onChange={e => setSelectedVm(e.target.value)} style={{ ...sel, width: "100%", maxWidth: 420 }}>
                            {vms.map(vm => (
                                <option key={vm.vmId} value={vm.vmId}>
                                    VM #{vm.vmId} — {vm.name} ({vm.node})
                                </option>
                            ))}
                        </select>
                    </div>

                    {infoLoading ? (
                        <div style={{ padding: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", gap: 10 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                            </svg>
                            Loading disk info…
                        </div>
                    ) : info && (
                        <>
                            {/* Stats */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                                {[
                                    { label: "Extra Disks",    value: `${info.usedSlots} / 5`,      color: "#a78bfa" },
                                    { label: "Extra Storage",  value: `${info.totalExtraGb} GB`,    color: "#38bdf8" },
                                    { label: "Free Slots",     value: `${info.freeSlots} remaining`, color: "#10b981" },
                                ].map(stat => (
                                    <div key={stat.label} style={{ ...card, padding: "18px 22px" }}>
                                        <p style={{ fontSize: "0.7rem", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{stat.label}</p>
                                        <p style={{ fontSize: "1.5rem", fontWeight: 800, color: stat.color }}>{stat.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Existing disks */}
                            {info.addons.length > 0 && (
                                <div style={card}>
                                    <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                        <h2 style={{ fontSize: "0.9rem", fontWeight: 700, color: "#94a3b8" }}>Attached Extra Disks</h2>
                                    </div>
                                    {info.addons.map((addon, idx) => (
                                        <div key={addon.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 120px 100px 120px", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: idx < info.addons.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                            <span style={{ padding: "3px 8px", borderRadius: 5, background: TIER_STYLES[addon.storageType as StorageType]?.bg ?? "rgba(255,255,255,0.05)", color: TIER_STYLES[addon.storageType as StorageType]?.color ?? "#94a3b8", fontSize: "0.7rem", fontWeight: 700, textAlign: "center" }}>
                                                {TIER_STYLES[addon.storageType as StorageType]?.label ?? addon.storageType.toUpperCase()}
                                            </span>
                                            <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#64748b" }}>{addon.storagePool}</span>
                                            <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.9rem" }}>{addon.sizeGb} GB</span>
                                            <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#475569" }}>{addon.diskSlot}</span>
                                            <span style={{ fontSize: "0.75rem", color: "#334155" }}>{formatDate(addon.purchasedAt)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Purchase form */}
                            {info.freeSlots > 0 ? (
                                <div style={{ ...card, padding: "24px 28px" }}>
                                    <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>Attach New Disk</h2>
                                    <p style={{ fontSize: "0.8rem", color: "#475569", marginBottom: 20 }}>
                                        Will be provisioned as <code style={{ color: "#a78bfa" }}>sata{info.usedSlots + 1}</code> on node <strong style={{ color: "#64748b" }}>{info.node}</strong>.
                                    </p>
                                    <form onSubmit={handlePurchase} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

                                            {/* Tier */}
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Storage Tier</label>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    {(Object.keys(TIER_STYLES) as StorageType[]).map(t => (
                                                        <label key={t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${storageType === t ? TIER_STYLES[t].color + "55" : "rgba(255,255,255,0.07)"}`, background: storageType === t ? TIER_STYLES[t].bg : "transparent", cursor: "pointer", transition: "all 0.15s" }}>
                                                            <input type="radio" name="type" value={t} checked={storageType === t} onChange={() => setStorageType(t)} style={{ display: "none" }} />
                                                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: storageType === t ? TIER_STYLES[t].color : "#334155", flexShrink: 0 }} />
                                                            <div>
                                                                <div style={{ fontSize: "0.84rem", fontWeight: 600, color: storageType === t ? TIER_STYLES[t].color : "#94a3b8" }}>{TIER_STYLES[t].label}</div>
                                                                <div style={{ fontSize: "0.7rem", color: "#475569" }}>{info.pricing[t].toLocaleString()} VND / GB</div>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Size slider */}
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                                                    Size: <span style={{ color: "#a78bfa" }}>{sizeGb} GB</span>
                                                </label>
                                                <input type="range" min={info.limits.min} max={info.limits.max} step={info.limits.step}
                                                    value={sizeGb} onChange={e => setSizeGb(Number(e.target.value))}
                                                    style={{ width: "100%", accentColor: "#a78bfa", cursor: "pointer" }}
                                                />
                                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                                                    <span style={{ fontSize: "0.68rem", color: "#334155" }}>{info.limits.min} GB</span>
                                                    <span style={{ fontSize: "0.68rem", color: "#334155" }}>{info.limits.max} GB</span>
                                                </div>
                                                {/* Direct input */}
                                                <input type="number" min={info.limits.min} max={info.limits.max} step={info.limits.step}
                                                    value={sizeGb} onChange={e => setSizeGb(Number(e.target.value))}
                                                    style={{ marginTop: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, color: "#e2e8f0", fontSize: "0.875rem", outline: "none", padding: "8px 12px", width: "100%", boxSizing: "border-box" }}
                                                />
                                            </div>

                                            {/* Cost + submit */}
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Total Cost</label>
                                                <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.12)" }}>
                                                    <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#a78bfa", lineHeight: 1 }}>{cost}</div>
                                                    <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: 4 }}>VND one-time</div>
                                                </div>
                                                <button type="submit" id="btn-attach-block-disk" disabled={submitting}
                                                    style={{ marginTop: 12, width: "100%", padding: "10px", borderRadius: 8, border: "none", background: submitting ? "#3b1f6e" : "linear-gradient(135deg, #a78bfa, #7c3aed)", color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: submitting ? "not-allowed" : "pointer" }}>
                                                    {submitting ? "Attaching…" : `Attach ${sizeGb} GB`}
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            ) : (
                                <div style={{ ...card, padding: "20px 24px", textAlign: "center", borderColor: "rgba(239,68,68,0.2)" }}>
                                    <p style={{ color: "#ef4444", fontWeight: 600 }}>⚠ All 5 extra disk slots are occupied for this VM.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
