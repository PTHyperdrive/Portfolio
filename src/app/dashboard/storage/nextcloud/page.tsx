"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { X, CheckCircle2, AlertCircle, CloudUpload } from "lucide-react";

interface NcStorage { provisioned: boolean; eligible: boolean; ncUsername: string | null; freeGb: number; paidGb: number; totalGb: number; remainingGb?: number; maxTotalGb: number; stepGb: number; pricing: { nvme: number; sata: number; hdd: number }; limits: { min: number; max: number; step: number }; }
type StorageType = "nvme" | "sata" | "hdd";
const TIER_LABELS: Record<StorageType, string> = { nvme: "NVMe SSD", sata: "SATA SSD", hdd: "HDD" };

export default function NextcloudStoragePage() {
    const t = useThemeTokens();
    const [data, setData] = useState<NcStorage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [expandGb, setExpandGb] = useState(5);
    const [expandType, setExpandType] = useState<StorageType>("sata");
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => { try { const res = await fetch("/api/user/nextcloud-storage"); if (!res.ok) throw new Error("Failed."); setData(await res.json()); } catch (err) { setError(err instanceof Error ? err.message : "Failed."); } finally { setLoading(false); } }, []);
    useEffect(() => { load(); }, [load]);

    const handleProvision = async () => { setSubmitting(true); setError(""); const res = await fetch("/api/user/nextcloud-storage", { method: "POST" }); const json = await res.json(); if (!res.ok) { setError(json.error || "Failed."); setSubmitting(false); return; } setSuccess(json.message || "Nextcloud storage activated!"); load(); setSubmitting(false); };
    const handleExpand = async (e: React.FormEvent) => { e.preventDefault(); setSubmitting(true); setError(""); const res = await fetch("/api/user/nextcloud-storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storageType: expandType, expandGb }) }); const json = await res.json(); if (!res.ok) { setError(json.error || "Failed."); setSubmitting(false); return; } setSuccess(`+${expandGb} GB ${TIER_LABELS[expandType]} cloud storage added.`); setExpandGb(5); load(); setSubmitting(false); };

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const cost = data ? (data.pricing[expandType] * expandGb).toLocaleString() : "0";
    const usedPct = data ? Math.round((data.totalGb / data.maxTotalGb) * 100) : 0;

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: "0.78rem", color: t.textMuted }}>Dashboard</span><span style={{ color: t.textMuted }}>•</span>
                    <Link href="/dashboard/storage/block" style={{ fontSize: "0.78rem", color: t.textMuted, textDecoration: "none" }}>Block Storage</Link><span style={{ color: t.textMuted }}>•</span>
                    <span style={{ fontSize: "0.78rem", color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Nextcloud</span>
                </div>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Nextcloud Storage</h1>
                <p style={{ marginTop: 6, fontSize: "0.83rem", color: t.textMuted, maxWidth: 520 }}>Cloud file storage accessible from any device. 5 GB free with any active VM lease. Expand in 5 GB blocks up to 100 GB total.</p>
            </div>

            {success && <div style={{ padding: "12px 16px", borderRadius: t.buttonRadius, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 style={{ width: 14, height: 14, flexShrink: 0 }} /> {success}</span><button onClick={() => setSuccess("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center" }}><X style={{ width: 14, height: 14 }} /></button></div>}
            {error && <div style={{ padding: "12px 16px", borderRadius: t.buttonRadius, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {error}</span><button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center" }}><X style={{ width: 14, height: 14 }} /></button></div>}

            {loading ? <div style={{ padding: 60, display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted }}>Loading…</div> : !data ? null : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Not eligible */}
                    {!data.eligible && !data.provisioned && (
                        <div style={{ ...card, padding: "32px 28px", textAlign: "center", borderColor: `${t.statusWarning}33` }}>
                            <div style={{ width: 72, height: 72, borderRadius: 18, background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={t.statusWarning} strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                            </div>
                            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 10 }}>VM Lease Required</h2>
                            <p style={{ color: t.textMuted, fontSize: "0.875rem", lineHeight: 1.6, maxWidth: 380, margin: "0 auto 24px" }}>Nextcloud cloud storage requires at least one active VM.</p>
                            <Link href="/dashboard/compute/new" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: t.buttonRadius, textDecoration: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem" }}>Deploy a VM</Link>
                        </div>
                    )}

                    {/* Eligible not provisioned */}
                    {data.eligible && !data.provisioned && (
                        <div style={{ ...card, padding: "32px 28px", textAlign: "center", borderColor: `${t.accentPrimary}33` }}>
                            <div style={{ width: 72, height: 72, borderRadius: 18, background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={t.accentPrimary} strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                            </div>
                            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 10 }}>Claim Your Free 5 GB</h2>
                            <p style={{ color: t.textMuted, fontSize: "0.875rem", lineHeight: 1.6, maxWidth: 380, margin: "0 auto 24px" }}>You qualify for 5 GB of free Nextcloud cloud storage.</p>
                            <button id="btn-activate-nextcloud" onClick={handleProvision} disabled={submitting} style={{ padding: "11px 32px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.925rem", cursor: submitting ? "not-allowed" : "pointer", boxShadow: t.shadow }}>{submitting ? "Activating…" : "Activate Free Storage"}</button>
                        </div>
                    )}

                    {/* Provisioned */}
                    {data.provisioned && (
                        <>
                            {/* Stats */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
                                {[{ label: "Total Quota", value: `${data.totalGb} GB`, sub: `of ${data.maxTotalGb} GB max` }, { label: "Free Included", value: `${data.freeGb} GB`, sub: "permanent" }, { label: "Available to Add", value: `${data.remainingGb ?? (data.maxTotalGb - data.totalGb)} GB`, sub: "in 5 GB steps" }].map(stat => (
                                    <div key={stat.label} style={{ ...card, padding: "20px 24px" }}>
                                        <p style={{ fontSize: "0.72rem", color: t.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{stat.label}</p>
                                        <p style={{ fontSize: "1.8rem", fontWeight: 800, color: t.accentPrimary, lineHeight: 1 }}>{stat.value}</p>
                                        <p style={{ fontSize: "0.75rem", color: t.textMuted, marginTop: 4 }}>{stat.sub}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Quota bar */}
                            <div style={{ ...card, padding: "20px 24px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                    <span style={{ fontSize: "0.82rem", color: t.textSecondary, fontWeight: 600 }}>Quota Usage</span>
                                    <span style={{ fontSize: "0.82rem", color: t.textMuted }}>{data.totalGb} / {data.maxTotalGb} GB ({usedPct}%)</span>
                                </div>
                                <div style={{ height: 10, borderRadius: 5, background: t.borderPrimary, overflow: "hidden" }}>
                                    <div style={{ height: "100%", borderRadius: 5, background: t.accentPrimary, width: `${usedPct}%`, transition: "width 0.5s" }} />
                                </div>
                                {data.ncUsername && <p style={{ marginTop: 10, fontSize: "0.75rem", color: t.textMuted, fontFamily: t.fontMono }}>NC account: <span style={{ color: t.textSecondary }}>{data.ncUsername}</span></p>}
                            </div>

                            {/* Expansion form */}
                            {(data.remainingGb ?? (data.maxTotalGb - data.totalGb)) > 0 ? (
                                <div style={{ ...card, padding: "24px 28px" }}>
                                    <h2 style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>Expand Storage</h2>
                                    <p style={{ fontSize: "0.8rem", color: t.textMuted, marginBottom: 20 }}>Must be in {data.stepGb} GB blocks. Current paid: {data.paidGb} GB.</p>
                                    <form onSubmit={handleExpand} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Storage Tier</label>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    {(Object.keys(TIER_LABELS) as StorageType[]).map(tt => (
                                                        <label key={tt} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: t.cardRadius, border: `1px solid ${expandType === tt ? t.accentPrimary + "55" : t.borderPrimary}`, background: expandType === tt ? t.accentPrimaryMuted : "transparent", cursor: "pointer", transition: "all 0.15s" }}>
                                                            <input type="radio" name="tier" value={tt} checked={expandType === tt} onChange={() => setExpandType(tt)} style={{ display: "none" }} />
                                                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: expandType === tt ? t.accentPrimary : t.textMuted, flexShrink: 0 }} />
                                                            <div>
                                                                <div style={{ fontSize: "0.84rem", fontWeight: 600, color: expandType === tt ? t.accentPrimary : t.textSecondary }}>{TIER_LABELS[tt]}</div>
                                                                <div style={{ fontSize: "0.7rem", color: t.textMuted }}>{data.pricing[tt].toLocaleString()} VND / GB</div>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Amount: <span style={{ color: t.accentPrimary }}>{expandGb} GB</span></label>
                                                <input type="range" min={5} max={Math.min(95, data.remainingGb ?? (data.maxTotalGb - data.totalGb))} step={5} value={expandGb} onChange={e => setExpandGb(Number(e.target.value))} style={{ width: "100%", accentColor: t.accentPrimary, cursor: "pointer" }} />
                                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}><span style={{ fontSize: "0.68rem", color: t.textMuted }}>5 GB</span><span style={{ fontSize: "0.68rem", color: t.textMuted }}>{Math.min(95, data.remainingGb ?? 95)} GB</span></div>
                                            </div>
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Total Cost</label>
                                                <div style={{ padding: "14px 16px", borderRadius: 10, background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}22` }}>
                                                    <div style={{ fontSize: "1.6rem", fontWeight: 800, color: t.accentPrimary, lineHeight: 1 }}>{cost}</div>
                                                    <div style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 4 }}>VND one-time</div>
                                                </div>
                                                <button type="submit" id="btn-expand-nc-storage" disabled={submitting} style={{ marginTop: 12, width: "100%", padding: 10, borderRadius: t.buttonRadius, border: "none", background: submitting ? t.textMuted : t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: submitting ? "not-allowed" : "pointer" }}>{submitting ? "Processing…" : `Add ${expandGb} GB`}</button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            ) : (
                                <div style={{ ...card, padding: "20px 24px", textAlign: "center", borderColor: `${t.statusSuccess}33` }}><p style={{ color: t.statusSuccess, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><CheckCircle2 style={{ width: 14, height: 14 }} /> Maximum quota reached (100 GB)</p></div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
