"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Server, Trash2, Database, ShieldCheck, RefreshCw } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";

interface VpsInstance { id: string; vmId: string; name: string; node: string; }
interface Backup { volid: string; ctime: number; size: number; notes?: string; vmid?: string; }

function formatBytes(b: number) { if (!b) return "—"; if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`; return `${(b / 1e6).toFixed(1)} MB`; }
function formatTs(ts: number) { return new Date(ts * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); }
function archiveName(volid: string) { return volid.split("/").pop() ?? volid; }

function SubNav({ active }: { active: "snapshots" | "backups" | "isos" }) {
    const t = useThemeTokens();
    const tabs = [
        { label: "Snapshots", href: "/dashboard/orchestration/snapshots" },
        { label: "Backups",   href: "/dashboard/orchestration/backups"   },
        { label: "ISOs",      href: "/dashboard/orchestration/isos"      },
    ] as const;
    return (
        <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${t.borderPrimary}`, paddingBottom: 0 }}>
            {tabs.map(tab => {
                const on = active === tab.label.toLowerCase();
                return (
                    <Link key={tab.label} href={tab.href} style={{ padding: "8px 18px", borderRadius: `${t.buttonRadius}px ${t.buttonRadius}px 0 0`, textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, color: on ? t.accentPrimary : t.textMuted, borderBottom: on ? `2px solid ${t.accentPrimary}` : "2px solid transparent", background: on ? t.accentPrimaryMuted : "transparent", transition: "all 0.15s" }}>
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}

export default function BackupsPage() {
    const t = useThemeTokens();
    const [vms, setVms]           = useState<VpsInstance[]>([]);
    const [selectedVm, setSelectedVm] = useState("");
    const [storages, setStorages] = useState<string[]>([]);
    const [selectedStorage, setSelectedStorage] = useState("");
    const [backups, setBackups]   = useState<Backup[]>([]);
    const [loading, setLoading]   = useState(true);
    const [bkLoading, setBkLoading] = useState(false);
    const [error, setError]       = useState("");
    const [success, setSuccess]   = useState("");
    const [notes, setNotes]       = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetch("/api/proxmox/vms?limit=50")
            .then(r => r.json())
            .then(d => { const list: VpsInstance[] = d.instances ?? []; setVms(list); if (list[0]) setSelectedVm(list[0].vmId); })
            .catch(() => setError("Failed to load VMs."))
            .finally(() => setLoading(false));
    }, []);

    const loadBackups = useCallback(async (vmId: string) => {
        if (!vmId) return;
        setBkLoading(true); setBackups([]); setStorages([]);
        try {
            const res = await fetch(`/api/vps/${vmId}/backups`);
            if (!res.ok) throw new Error("Failed to load backups.");
            const data = await res.json();
            setBackups(data.backups ?? []);
            setStorages(data.storages ?? []);
            if ((data.storages ?? []).length > 0) setSelectedStorage(data.storages[0]);
        } catch (err) { setError(err instanceof Error ? err.message : "Failed."); }
        finally { setBkLoading(false); }
    }, []);

    useEffect(() => { if (selectedVm) loadBackups(selectedVm); }, [selectedVm, loadBackups]);

    const handleBackup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStorage) { setError("No backup storage available on this node."); return; }
        setSubmitting(true); setError("");
        const res = await fetch(`/api/vps/${selectedVm}/backups`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storage: selectedStorage, notes: notes || undefined }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Backup failed."); setSubmitting(false); return; }
        setSuccess(`Backup queued (UPID: ${json.upid?.slice(0, 20)}…). Mode: snapshot · Compress: zstd`);
        setNotes("");
        setTimeout(() => loadBackups(selectedVm), 5000);
        setSubmitting(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true); setError("");
        const res = await fetch(`/api/vps/${selectedVm}/backups`, {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ volid: deleteTarget.volid }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Delete failed."); }
        else { setSuccess("Backup deleted."); }
        setDeleteTarget(null); setDeleting(false); loadBackups(selectedVm);
    };

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const input: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "0.875rem", outline: "none", padding: "9px 13px", width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit" };
    const sel: React.CSSProperties = { ...input, cursor: "pointer" };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <div style={{ marginBottom: 6 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted }}>Dashboard&nbsp;•&nbsp;Orchestration</p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary, marginTop: 4 }}>Orchestration</h1>
            </div>

            <SubNav active="backups" />

            {success && <div style={{ padding: "12px 16px", borderRadius: t.buttonRadius, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>{success}<button onClick={() => setSuccess("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button></div>}
            {error   && <div style={{ padding: "12px 16px", borderRadius: t.buttonRadius, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>{error}<button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button></div>}

            {loading ? (
                <div style={{ padding: 60, display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, gap: 10 }}>
                    <RefreshCw style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                    Loading VMs…
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Policy notice */}
                    <div style={{ padding: "12px 18px", borderRadius: t.buttonRadius, background: t.accentPrimaryMuted, border: `1px solid ${t.borderPrimary}`, display: "flex", alignItems: "center", gap: 10, fontSize: "0.8rem", color: t.textSecondary }}>
                        <ShieldCheck style={{ width: 14, height: 14, color: t.accentPrimary, flexShrink: 0 }} />
                        <span>All backups are live <strong style={{ color: t.textPrimary }}>snapshot-mode</strong> (no VM downtime) · Compressed with <strong style={{ color: t.textPrimary }}>zstd</strong> · These settings are enforced and cannot be changed.</span>
                    </div>

                    {/* VM + Storage selector */}
                    <div style={{ ...card, padding: "18px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        <Server style={{ width: 18, height: 18, color: t.accentPrimary }} />
                        <select id="backup-vm-select" value={selectedVm} onChange={e => setSelectedVm(e.target.value)} style={{ ...sel, maxWidth: 320 }}>
                            {vms.map(vm => <option key={vm.vmId} value={vm.vmId}>VM #{vm.vmId} — {vm.name}</option>)}
                        </select>
                        {storages.length > 0 && (
                            <>
                                <span style={{ color: t.textMuted, fontSize: "0.8rem" }}>→</span>
                                <select value={selectedStorage} onChange={e => setSelectedStorage(e.target.value)} style={{ ...sel, maxWidth: 200 }}>
                                    {storages.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </>
                        )}
                    </div>

                    {/* Create backup */}
                    <div style={{ ...card, padding: "24px 28px" }}>
                        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 16 }}>Create Backup</h2>
                        <form onSubmit={handleBackup} style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Notes (optional)</label>
                                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Weekly backup before maintenance" style={input} />
                            </div>
                            <button type="submit" id="btn-create-backup" disabled={submitting || !selectedVm || !selectedStorage}
                                style={{ padding: "9px 24px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: submitting || !selectedVm || !selectedStorage ? "not-allowed" : "pointer", opacity: submitting || !selectedVm || !selectedStorage ? 0.5 : 1, whiteSpace: "nowrap" }}>
                                {submitting ? "Queuing…" : "Start Backup"}
                            </button>
                        </form>
                    </div>

                    {/* Backup list */}
                    <div style={card}>
                        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h2 style={{ fontSize: "0.9rem", fontWeight: 700, color: t.textSecondary, display: "flex", alignItems: "center", gap: 8 }}>
                                <Database style={{ width: 15, height: 15, color: t.textMuted }} />
                                Backup Archive
                                {backups.length > 0 && <span style={{ padding: "1px 8px", borderRadius: 10, fontSize: "0.65rem", fontWeight: 700, background: t.accentPrimaryMuted, color: t.accentPrimary }}>{backups.length}</span>}
                            </h2>
                            <button onClick={() => loadBackups(selectedVm)} style={{ background: "none", border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textSecondary, padding: "5px 12px", fontSize: "0.75rem", cursor: "pointer" }}>Refresh</button>
                        </div>

                        {bkLoading ? (
                            <div style={{ padding: 32, textAlign: "center", color: t.textMuted, fontSize: "0.875rem" }}>Loading…</div>
                        ) : backups.length === 0 ? (
                            <div style={{ padding: "40px", textAlign: "center", color: t.textMuted, fontSize: "0.875rem" }}>No backups found.</div>
                        ) : (
                            backups.map((bk, idx) => (
                                <div key={bk.volid} style={{ display: "grid", gridTemplateColumns: "1fr 120px 160px auto", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: idx < backups.length - 1 ? `1px solid ${t.borderSecondary}` : "none" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = t.bgCardHover}
                                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                                    <div>
                                        <span style={{ fontFamily: t.fontMono, fontSize: "0.78rem", color: t.textPrimary, fontWeight: 600 }}>{archiveName(bk.volid)}</span>
                                        {bk.notes && <span style={{ display: "block", fontSize: "0.7rem", color: t.textMuted, marginTop: 2 }}>{bk.notes}</span>}
                                    </div>
                                    <span style={{ fontSize: "0.8rem", color: t.accentPrimary, fontWeight: 600 }}>{formatBytes(bk.size)}</span>
                                    <span style={{ fontSize: "0.75rem", color: t.textMuted }}>{formatTs(bk.ctime)}</span>
                                    <button title="Delete backup" onClick={() => setDeleteTarget(bk)}
                                        style={{ width: 30, height: 30, borderRadius: t.buttonRadius, border: `1px solid ${t.statusError}33`, background: t.statusErrorBg, color: t.statusError, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Trash2 style={{ width: 13, height: 13 }} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div style={{ position: "fixed", inset: 0, background: t.isLight ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                    <div style={{ ...card, padding: "28px 32px", width: 440, border: `1px solid ${t.statusError}44` }}>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: t.textPrimary, marginBottom: 10 }}>Delete Backup?</h3>
                        <p style={{ fontSize: "0.875rem", color: t.textSecondary, lineHeight: 1.6, fontFamily: t.fontMono, wordBreak: "break-all" }}>{archiveName(deleteTarget.volid)}</p>
                        <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
                            <button onClick={() => setDeleteTarget(null)} style={{ padding: "9px 20px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontSize: "0.875rem", cursor: "pointer" }}>Cancel</button>
                            <button onClick={handleDelete} disabled={deleting} style={{ padding: "9px 20px", borderRadius: t.buttonRadius, border: "none", background: t.statusError, color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: deleting ? "not-allowed" : "pointer" }}>
                                {deleting ? "Deleting…" : "Delete Backup"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
