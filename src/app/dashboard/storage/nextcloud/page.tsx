"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────

interface NcStorage {
    provisioned: boolean;
    eligible: boolean;
    ncUsername: string | null;
    freeGb: number;
    paidGb: number;
    totalGb: number;
    remainingGb?: number;
    maxTotalGb: number;
    stepGb: number;
    pricing: { nvme: number; sata: number; hdd: number };
    limits: { min: number; max: number; step: number };
}

type StorageType = "nvme" | "sata" | "hdd";

const TIER_STYLES: Record<StorageType, { label: string; color: string; bg: string }> = {
    nvme: { label: "NVMe SSD",  color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
    sata: { label: "SATA SSD",  color: "#38bdf8", bg: "rgba(56,189,248,0.1)"  },
    hdd:  { label: "HDD",       color: "#fb923c", bg: "rgba(251,146,60,0.1)"  },
};

// ── Page ───────────────────────────────────────────────────────────

export default function NextcloudStoragePage() {
    const [data, setData] = useState<NcStorage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Expansion form
    const [expandGb, setExpandGb] = useState(5);
    const [expandType, setExpandType] = useState<StorageType>("sata");
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/user/nextcloud-storage");
            if (!res.ok) throw new Error("Failed to load storage info.");
            setData(await res.json());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleProvision = async () => {
        setSubmitting(true); setError("");
        const res = await fetch("/api/user/nextcloud-storage", { method: "POST" });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed."); setSubmitting(false); return; }
        setSuccess(`✅ ${json.message || "Nextcloud storage activated!"}`);
        load();
        setSubmitting(false);
    };

    const handleExpand = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true); setError("");
        const res = await fetch("/api/user/nextcloud-storage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storageType: expandType, expandGb }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed."); setSubmitting(false); return; }
        setSuccess(`+${expandGb} GB ${TIER_STYLES[expandType].label} cloud storage added.`);
        setExpandGb(5);
        load();
        setSubmitting(false);
    };

    // ── Styles ─────────────────────────────────────────────────────
    const bg = "#0d1117";
    const card: React.CSSProperties = { background: "#161b22", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14 };
    const sel: React.CSSProperties  = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, color: "#e2e8f0", fontSize: "0.875rem", outline: "none", padding: "9px 13px", cursor: "pointer" };

    const cost = data ? (data.pricing[expandType] * expandGb).toLocaleString() : "0";
    const usedPct = data ? Math.round((data.totalGb / data.maxTotalGb) * 100) : 0;

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: bg }}>

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: "0.78rem", color: "#475569" }}>Dashboard</span>
                    <span style={{ color: "#334155" }}>•</span>
                    <Link href="/dashboard/storage/block" style={{ fontSize: "0.78rem", color: "#475569", textDecoration: "none", padding: "2px 10px", borderRadius: 6, background: "transparent" }}>
                        Block Storage
                    </Link>
                    <span style={{ color: "#334155" }}>•</span>
                    <span style={{ fontSize: "0.78rem", color: "#38bdf8", fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: "rgba(56,189,248,0.08)" }}>Nextcloud</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f1f5f9" }}>Nextcloud Storage</h1>
                </div>
                <p style={{ marginTop: 6, fontSize: "0.83rem", color: "#475569", maxWidth: 520 }}>
                    Cloud file storage accessible from any device. 5 GB free with any active VM lease.
                    Expand in 5 GB blocks up to 100 GB total.
                </p>
            </div>

            {/* Toasts */}
            {success && (
                <div style={{ padding: "12px 16px", borderRadius: 9, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#10b981", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>
                    {success}
                    <button onClick={() => setSuccess("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
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
                    Loading…
                </div>
            ) : !data ? null : (

                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* ── Not eligible gate ── */}
                    {!data.eligible && !data.provisioned && (
                        <div style={{ ...card, padding: "32px 28px", textAlign: "center", borderColor: "rgba(245,158,11,0.2)" }}>
                            <div style={{ width: 72, height: 72, borderRadius: 18, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5">
                                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                            </div>
                            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>VM Lease Required</h2>
                            <p style={{ color: "#64748b", fontSize: "0.875rem", lineHeight: 1.6, maxWidth: 380, margin: "0 auto 24px" }}>
                                Nextcloud cloud storage requires at least one active VM (minimum: Nano-NAT plan).
                            </p>
                            <Link href="/dashboard/compute/new"
                                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: 9, textDecoration: "none", background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontWeight: 700, fontSize: "0.875rem" }}>
                                Deploy a VM
                            </Link>
                        </div>
                    )}

                    {/* ── Eligible but not provisioned yet ── */}
                    {data.eligible && !data.provisioned && (
                        <div style={{ ...card, padding: "32px 28px", textAlign: "center", borderColor: "rgba(56,189,248,0.2)" }}>
                            <div style={{ width: 72, height: 72, borderRadius: 18, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.5">
                                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                                </svg>
                            </div>
                            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>Claim Your Free 5 GB</h2>
                            <p style={{ color: "#64748b", fontSize: "0.875rem", lineHeight: 1.6, maxWidth: 380, margin: "0 auto 24px" }}>
                                You qualify for 5 GB of free Nextcloud cloud storage. Activate it now — no charge.
                            </p>
                            <button id="btn-activate-nextcloud" onClick={handleProvision} disabled={submitting}
                                style={{ padding: "11px 32px", borderRadius: 9, border: "none", background: "linear-gradient(135deg, #38bdf8, #0ea5e9)", color: "#fff", fontWeight: 700, fontSize: "0.925rem", cursor: submitting ? "not-allowed" : "pointer", boxShadow: "0 4px 16px rgba(56,189,248,0.3)" }}>
                                {submitting ? "Activating…" : "Activate Free Storage"}
                            </button>
                        </div>
                    )}

                    {/* ── Provisioned: quota overview + expansion ── */}
                    {data.provisioned && (
                        <>
                            {/* Stats row */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                                {[
                                    { label: "Total Quota", value: `${data.totalGb} GB`, sub: `of ${data.maxTotalGb} GB max`, color: "#38bdf8" },
                                    { label: "Free Included", value: `${data.freeGb} GB`, sub: "permanent", color: "#10b981" },
                                    { label: "Available to Add", value: `${data.remainingGb ?? (data.maxTotalGb - data.totalGb)} GB`, sub: "in 5 GB steps", color: "#a78bfa" },
                                ].map(stat => (
                                    <div key={stat.label} style={{ ...card, padding: "20px 24px" }}>
                                        <p style={{ fontSize: "0.72rem", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{stat.label}</p>
                                        <p style={{ fontSize: "1.8rem", fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</p>
                                        <p style={{ fontSize: "0.75rem", color: "#475569", marginTop: 4 }}>{stat.sub}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Quota bar */}
                            <div style={{ ...card, padding: "20px 24px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                    <span style={{ fontSize: "0.82rem", color: "#94a3b8", fontWeight: 600 }}>Quota Usage</span>
                                    <span style={{ fontSize: "0.82rem", color: "#64748b" }}>{data.totalGb} / {data.maxTotalGb} GB ({usedPct}%)</span>
                                </div>
                                <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                                    <div style={{ height: "100%", borderRadius: 5, background: "linear-gradient(90deg, #38bdf8, #0ea5e9)", width: `${usedPct}%`, transition: "width 0.5s" }} />
                                </div>
                                {data.ncUsername && (
                                    <p style={{ marginTop: 10, fontSize: "0.75rem", color: "#334155", fontFamily: "monospace" }}>
                                        NC account: <span style={{ color: "#475569" }}>{data.ncUsername}</span>
                                    </p>
                                )}
                            </div>

                            {/* Expansion form */}
                            {(data.remainingGb ?? (data.maxTotalGb - data.totalGb)) > 0 ? (
                                <div style={{ ...card, padding: "24px 28px" }}>
                                    <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>Expand Storage</h2>
                                    <p style={{ fontSize: "0.8rem", color: "#475569", marginBottom: 20 }}>
                                        Must be in {data.stepGb} GB blocks. Current paid: {data.paidGb} GB.
                                    </p>

                                    <form onSubmit={handleExpand} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

                                            {/* Storage tier */}
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Storage Tier</label>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    {(Object.keys(TIER_STYLES) as StorageType[]).map(t => (
                                                        <label key={t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${expandType === t ? TIER_STYLES[t].color + "55" : "rgba(255,255,255,0.07)"}`, background: expandType === t ? TIER_STYLES[t].bg : "transparent", cursor: "pointer", transition: "all 0.15s" }}>
                                                            <input type="radio" name="tier" value={t} checked={expandType === t} onChange={() => setExpandType(t)} style={{ display: "none" }} />
                                                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: expandType === t ? TIER_STYLES[t].color : "#334155", flexShrink: 0, transition: "background 0.15s" }} />
                                                            <div>
                                                                <div style={{ fontSize: "0.84rem", fontWeight: 600, color: expandType === t ? TIER_STYLES[t].color : "#94a3b8" }}>{TIER_STYLES[t].label}</div>
                                                                <div style={{ fontSize: "0.7rem", color: "#475569" }}>{data.pricing[t].toLocaleString()} VND / GB</div>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Amount slider */}
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                                                    Amount: <span style={{ color: "#38bdf8" }}>{expandGb} GB</span>
                                                </label>
                                                <input type="range" min={5} max={Math.min(95, data.remainingGb ?? (data.maxTotalGb - data.totalGb))} step={5}
                                                    value={expandGb} onChange={e => setExpandGb(Number(e.target.value))}
                                                    style={{ width: "100%", accentColor: "#38bdf8", cursor: "pointer" }}
                                                />
                                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                                                    <span style={{ fontSize: "0.68rem", color: "#334155" }}>5 GB</span>
                                                    <span style={{ fontSize: "0.68rem", color: "#334155" }}>{Math.min(95, data.remainingGb ?? 95)} GB</span>
                                                </div>
                                            </div>

                                            {/* Cost summary */}
                                            <div>
                                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Total Cost</label>
                                                <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.12)" }}>
                                                    <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#38bdf8", lineHeight: 1 }}>{cost}</div>
                                                    <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: 4 }}>VND one-time</div>
                                                </div>
                                                <button type="submit" id="btn-expand-nc-storage" disabled={submitting}
                                                    style={{ marginTop: 12, width: "100%", padding: "10px", borderRadius: 8, border: "none", background: submitting ? "#0c4a6e" : "linear-gradient(135deg, #38bdf8, #0ea5e9)", color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: submitting ? "not-allowed" : "pointer" }}>
                                                    {submitting ? "Processing…" : `Add ${expandGb} GB`}
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            ) : (
                                <div style={{ ...card, padding: "20px 24px", textAlign: "center", borderColor: "rgba(16,185,129,0.2)" }}>
                                    <p style={{ color: "#10b981", fontWeight: 600 }}>✅ Maximum quota reached (100 GB)</p>
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
