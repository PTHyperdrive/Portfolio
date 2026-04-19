"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { X, AlertTriangle } from "lucide-react";

interface VpsInstance { id: string; vmId: string; name: string; node: string; status: string; }
interface BlockAddon { id: string; storageType: string; storagePool: string; diskSlot: string; sizeGb: number; pricePerGb: number; totalCost: number; purchasedAt: string; }
interface StorageInfo { vmId: string; node: string; addons: BlockAddon[]; totalExtraGb: number; usedSlots: number; freeSlots: number; limits: { min: number; max: number; step: number }; pricing: { nvme: number; sata: number; hdd: number }; }
type StorageType = "nvme" | "sata" | "hdd";

const TIER_LABELS: Record<StorageType, string> = { nvme: "NVMe SSD", sata: "SATA SSD", hdd: "HDD" };

function formatDate(iso: string) { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" }); }

export default function BlockStoragePage() {
    const t = useThemeTokens();
    const [vms, setVms] = useState<VpsInstance[]>([]);
    const [selectedVm, setSelectedVm] = useState("");
    const [info, setInfo] = useState<StorageInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [infoLoading, setInfoLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [sizeGb, setSizeGb] = useState(50);
    const [storageType, setStorageType] = useState<StorageType>("sata");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => { fetch("/api/proxmox/vms?limit=50").then(r => r.json()).then(d => { const list: VpsInstance[] = d.instances ?? []; setVms(list); if (list.length > 0) setSelectedVm(list[0].vmId); }).catch(() => setError("Failed to load VMs.")).finally(() => setLoading(false)); }, []);
    const loadInfo = useCallback(async (vmId: string) => { if (!vmId) return; setInfoLoading(true); setInfo(null); try { const res = await fetch(`/api/vps/${vmId}/storage`); if (!res.ok) throw new Error("Failed."); setInfo(await res.json()); } catch (err) { setError(err instanceof Error ? err.message : "Failed."); } finally { setInfoLoading(false); } }, []);
    useEffect(() => { if (selectedVm) loadInfo(selectedVm); }, [selectedVm, loadInfo]);

    const handlePurchase = async (e: React.FormEvent) => {
        e.preventDefault(); setSubmitting(true); setError("");
        const res = await fetch(`/api/vps/${selectedVm}/storage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storageType, sizeGb }) });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed."); setSubmitting(false); return; }
        setSuccess(`+${sizeGb} GB ${TIER_LABELS[storageType]} attached to VM ${selectedVm} (${json.diskSlot})`);
        if (json.manualCommand) setSuccess(prev => `${prev}\nManual: ${json.manualCommand}`);
        setSizeGb(50); loadInfo(selectedVm); setSubmitting(false);
    };

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const inputStyle: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.isMono ? 4 : 8, color: t.textPrimary, fontSize: "0.875rem", outline: "none", padding: "9px 13px", cursor: "pointer" };
    const cost = info ? (info.pricing[storageType] * sizeGb).toLocaleString() : "—";

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: "0.78rem", color: t.textMuted }}>Dashboard</span>
                    <span style={{ color: t.textMuted }}>•</span>
                    <Link href="/dashboard/storage/nextcloud" style={{ fontSize: "0.78rem", color: t.textMuted, textDecoration: "none" }}>Nextcloud</Link>
                    <span style={{ color: t.textMuted }}>•</span>
                    <span style={{ fontSize: "0.78rem", color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Block Storage</span>
                </div>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Block Storage</h1>
                <p style={{ marginTop: 6, fontSize: "0.83rem", color: t.textMuted, maxWidth: 520 }}>Attach extra Proxmox disk volumes directly to your VMs (SATA bus). Up to 5 extra disks per VM, 10–2000 GB per disk.</p>
            </div>

            {/* Pricing badges */}
            <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
                {(Object.keys(TIER_LABELS) as StorageType[]).map(tt => (
                    <div key={tt} style={{ padding: "6px 14px", borderRadius: t.isMono ? 4 : 8, background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}33`, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: t.accentPrimary }}>{TIER_LABELS[tt]}</span>
                        <span style={{ fontSize: "0.72rem", color: t.textMuted }}>= 2,000 VND/GB</span>
                    </div>
                ))}
            </div>

            {/* Toasts */}
            {success && <div style={{ padding: "12px 16px", borderRadius: t.isMono ? 4 : 9, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", whiteSpace: "pre-line" }}>{success}<button onClick={() => setSuccess("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", flexShrink: 0, alignSelf: "flex-start", display: "flex", alignItems: "center" }}><X style={{ width: 14, height: 14 }} /></button></div>}
            {error && <div style={{ padding: "12px 16px", borderRadius: t.isMono ? 4 : 9, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>{error}<button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center" }}><X style={{ width: 14, height: 14 }} /></button></div>}

            {loading ? (
                <div style={{ padding: 60, display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, gap: 10 }}>Loading VMs…</div>
            ) : vms.length === 0 ? (
                <div style={{ ...card, padding: 40, textAlign: "center" }}><p style={{ color: t.textMuted, marginBottom: 16 }}>No VMs found. Deploy a VM first.</p><Link href="/dashboard/compute/new" style={{ padding: "10px 24px", borderRadius: t.buttonRadius, textDecoration: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem" }}>Deploy VM</Link></div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* VM Selector */}
                    <div style={{ ...card, padding: "20px 24px" }}>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Target VM</label>
                        <select id="block-storage-vm-select" value={selectedVm} onChange={e => setSelectedVm(e.target.value)} style={{ ...inputStyle, width: "100%", maxWidth: 420 }}>
                            {vms.map(vm => <option key={vm.vmId} value={vm.vmId}>VM #{vm.vmId} — {vm.name} ({vm.node})</option>)}
                        </select>
                    </div>

                    {infoLoading ? <div style={{ padding: 32, display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted }}>Loading disk info…</div> : info && (
                        <>
                            {/* Stats */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                                {[{ label: "Extra Disks", value: `${info.usedSlots} / 5` }, { label: "Extra Storage", value: `${info.totalExtraGb} GB` }, { label: "Free Slots", value: `${info.freeSlots} remaining` }].map(stat => (
                                    <div key={stat.label} style={{ ...card, padding: "18px 22px" }}>
                                        <p style={{ fontSize: "0.7rem", color: t.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{stat.label}</p>
                                        <p style={{ fontSize: "1.5rem", fontWeight: 800, color: t.accentPrimary }}>{stat.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Existing disks */}
                            {info.addons.length > 0 && (
                                <div style={card}>
                                    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                                        <h2 style={{ fontSize: "0.9rem", fontWeight: 700, color: t.textSecondary }}>Attached Extra Disks</h2>
                                    </div>
                                    {info.addons.map((addon, idx) => (
                                        <div key={addon.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 120px 100px 120px", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: idx < info.addons.length - 1 ? `1px solid ${t.borderSecondary}` : "none" }}>
                                            <span style={{ padding: "3px 8px", borderRadius: 5, background: t.accentPrimaryMuted, color: t.accentPrimary, fontSize: "0.7rem", fontWeight: 700, textAlign: "center" }}>{TIER_LABELS[addon.storageType as StorageType] ?? addon.storageType.toUpperCase()}</span>
                                            <span style={{ fontFamily: t.fontMono, fontSize: "0.8rem", color: t.textMuted }}>{addon.storagePool}</span>
                                            <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>{addon.sizeGb} GB</span>
                                            <span style={{ fontFamily: t.fontMono, fontSize: "0.75rem", color: t.textMuted }}>{addon.diskSlot}</span>
                                            <span style={{ fontSize: "0.75rem", color: t.textMuted }}>{formatDate(addon.purchasedAt)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Purchase form */}
                            {info.freeSlots > 0 ? (
                                <div style={{ ...card, padding: "24px 28px" }}>
                                    <h2 style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>Attach New Disk</h2>
                                    <p style={{ fontSize: "0.8rem", color: t.textMuted, marginBottom: 20 }}>Will be provisioned as <code style={{ color: t.accentPrimary }}>sata{info.usedSlots + 1}</code> on node <strong style={{ color: t.textSecondary }}>{info.node}</strong>.</p>
                                    <form onSubmit={handlePurchase} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Storage Tier</label>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    {(Object.keys(TIER_LABELS) as StorageType[]).map(tt => (
                                                        <label key={tt} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${storageType === tt ? t.accentPrimary + "55" : t.borderPrimary}`, background: storageType === tt ? t.accentPrimaryMuted : "transparent", cursor: "pointer", transition: "all 0.15s" }}>
                                                            <input type="radio" name="type" value={tt} checked={storageType === tt} onChange={() => setStorageType(tt)} style={{ display: "none" }} />
                                                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: storageType === tt ? t.accentPrimary : t.textMuted, flexShrink: 0 }} />
                                                            <div>
                                                                <div style={{ fontSize: "0.84rem", fontWeight: 600, color: storageType === tt ? t.accentPrimary : t.textSecondary }}>{TIER_LABELS[tt]}</div>
                                                                <div style={{ fontSize: "0.7rem", color: t.textMuted }}>{info.pricing[tt].toLocaleString()} VND / GB</div>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Size: <span style={{ color: t.accentPrimary }}>{sizeGb} GB</span></label>
                                                <input type="range" min={info.limits.min} max={info.limits.max} step={info.limits.step} value={sizeGb} onChange={e => setSizeGb(Number(e.target.value))} style={{ width: "100%", accentColor: t.accentPrimary, cursor: "pointer" }} />
                                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}><span style={{ fontSize: "0.68rem", color: t.textMuted }}>{info.limits.min} GB</span><span style={{ fontSize: "0.68rem", color: t.textMuted }}>{info.limits.max} GB</span></div>
                                                <input type="number" min={info.limits.min} max={info.limits.max} step={info.limits.step} value={sizeGb} onChange={e => setSizeGb(Number(e.target.value))} style={{ marginTop: 10, background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.isMono ? 4 : 8, color: t.textPrimary, fontSize: "0.875rem", outline: "none", padding: "8px 12px", width: "100%", boxSizing: "border-box" }} />
                                            </div>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Total Cost</label>
                                                <div style={{ padding: "14px 16px", borderRadius: 10, background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}22` }}>
                                                    <div style={{ fontSize: "1.6rem", fontWeight: 800, color: t.accentPrimary, lineHeight: 1 }}>{cost}</div>
                                                    <div style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 4 }}>VND one-time</div>
                                                </div>
                                                <button type="submit" id="btn-attach-block-disk" disabled={submitting} style={{ marginTop: 12, width: "100%", padding: 10, borderRadius: t.buttonRadius, border: "none", background: submitting ? t.textMuted : t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: submitting ? "not-allowed" : "pointer" }}>{submitting ? "Attaching…" : `Attach ${sizeGb} GB`}</button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            ) : (
                                <div style={{ ...card, padding: "20px 24px", textAlign: "center", borderColor: `${t.statusError}33` }}><p style={{ color: t.statusError, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><AlertTriangle style={{ width: 14, height: 14 }} /> All 5 extra disk slots are occupied.</p></div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
