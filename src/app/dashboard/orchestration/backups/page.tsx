"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Save } from "lucide-react";

interface VpsInstance { id: string; vmId: string; name: string; node: string; }
interface Backup { volid: string; ctime: number; size: number; notes?: string; vmid?: string; }

function formatBytes(b: number) { if (!b) return "—"; if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`; return `${(b / 1e6).toFixed(1)} MB`; }
function formatTs(ts: number) { return new Date(ts * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); }
function archiveName(volid: string) { return volid.split("/").pop() ?? volid; }

function SubNav({ active }: { active: "snapshots" | "backups" | "isos" }) {
    const tabs = [
        { label: "Snapshots", href: "/dashboard/orchestration/snapshots" },
        { label: "Backups",   href: "/dashboard/orchestration/backups"   },
        { label: "ISOs",      href: "/dashboard/orchestration/isos"      },
    ] as const;
    return (
        <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 0 }}>
            {tabs.map(t => (
                <Link key={t.label} href={t.href} style={{ padding: "8px 18px", borderRadius: "8px 8px 0 0", textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, color: active === t.label.toLowerCase() ? "#f1f5f9" : "#475569", borderBottom: active === t.label.toLowerCase() ? "2px solid #10b981" : "2px solid transparent", background: active === t.label.toLowerCase() ? "rgba(16,185,129,0.06)" : "transparent", transition: "all 0.15s" }}>
                    {t.label}
                </Link>
            ))}
        </div>
    );
}

export default function BackupsPage() {
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

    const bg = "#0d1117";
    const card: React.CSSProperties = { background: "#161b22", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14 };
    const input: React.CSSProperties = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, color: "#e2e8f0", fontSize: "0.875rem", outline: "none", padding: "9px 13px", width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit" };
    const sel: React.CSSProperties = { ...input, cursor: "pointer" };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: bg }}>
            <div style={{ marginBottom: 6 }}>
                <p style={{ fontSize: "0.78rem", color: "#475569" }}>Dashboard&nbsp;•&nbsp;Orchestration</p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f1f5f9", marginTop: 4 }}>Orchestration</h1>
            </div>

            <SubNav active="backups" />

            {success && <div style={{ padding: "12px 16px", borderRadius: 9, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#10b981", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>{success}<button onClick={() => setSuccess("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button></div>}
            {error   && <div style={{ padding: "12px 16px", borderRadius: 9, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>{error}<button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button></div>}

            {loading ? (
                <div style={{ padding: 60, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", gap: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
                    Loading VMs…
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Policy notice */}
                    <div style={{ padding: "12px 18px", borderRadius: 9, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", display: "flex", alignItems: "center", gap: 10, fontSize: "0.8rem", color: "#64748b" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                        <span>All backups are live <strong style={{ color: "#10b981" }}>snapshot-mode</strong> (no VM downtime) · Compressed with <strong style={{ color: "#10b981" }}>zstd</strong> · These settings are enforced and cannot be changed.</span>
                    </div>

                    {/* VM + Storage selector */}
                    <div style={{ ...card, padding: "18px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                        <select id="backup-vm-select" value={selectedVm} onChange={e => setSelectedVm(e.target.value)} style={{ ...sel, maxWidth: 320 }}>
                            {vms.map(vm => <option key={vm.vmId} value={vm.vmId}>VM #{vm.vmId} — {vm.name}</option>)}
                        </select>
                        {storages.length > 0 && (
                            <>
                                <span style={{ color: "#334155", fontSize: "0.8rem" }}>→</span>
                                <select value={selectedStorage} onChange={e => setSelectedStorage(e.target.value)} style={{ ...sel, maxWidth: 200 }}>
                                    {storages.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </>
                        )}
                    </div>

                    {/* Create backup */}
                    <div style={{ ...card, padding: "24px 28px" }}>
                        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 16 }}>Create Backup</h2>
                        <form onSubmit={handleBackup} style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Notes (optional)</label>
                                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Weekly backup before maintenance" style={input} />
                            </div>
                            <button type="submit" id="btn-create-backup" disabled={submitting || !selectedVm || !selectedStorage}
                                style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: submitting ? "#064e3b" : "linear-gradient(135deg, #10b981, #059669)", color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: submitting ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                                {submitting ? "Queuing…" : "Start Backup"}
                            </button>
                        </form>
                    </div>

                    {/* Backup list */}
                    <div style={card}>
                        <div style={{ padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h2 style={{ fontSize: "0.9rem", fontWeight: 700, color: "#94a3b8" }}>
                                Backup Archive
                                {backups.length > 0 && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 10, fontSize: "0.65rem", fontWeight: 700, background: "rgba(16,185,129,0.15)", color: "#10b981" }}>{backups.length}</span>}
                            </h2>
                            <button onClick={() => loadBackups(selectedVm)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#475569", padding: "5px 12px", fontSize: "0.75rem", cursor: "pointer" }}>Refresh</button>
                        </div>

                        {bkLoading ? (
                            <div style={{ padding: 32, textAlign: "center", color: "#334155", fontSize: "0.875rem" }}>Loading…</div>
                        ) : backups.length === 0 ? (
                            <div style={{ padding: "40px", textAlign: "center", color: "#334155", fontSize: "0.875rem" }}>No backups found.</div>
                        ) : (
                            backups.map((bk, idx) => (
                                <div key={bk.volid} style={{ display: "grid", gridTemplateColumns: "1fr 120px 160px auto", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: idx < backups.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.018)"}
                                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                                    <div>
                                        <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#e2e8f0", fontWeight: 600 }}>{archiveName(bk.volid)}</span>
                                        {bk.notes && <span style={{ display: "block", fontSize: "0.7rem", color: "#475569", marginTop: 2 }}>{bk.notes}</span>}
                                    </div>
                                    <span style={{ fontSize: "0.8rem", color: "#38bdf8", fontWeight: 600 }}>{formatBytes(bk.size)}</span>
                                    <span style={{ fontSize: "0.75rem", color: "#334155" }}>{formatTs(bk.ctime)}</span>
                                    <button title="Delete backup" onClick={() => setDeleteTarget(bk)}
                                        style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                    <div style={{ ...card, padding: "28px 32px", width: 440, borderColor: "rgba(239,68,68,0.25)" }}>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f1f5f9", marginBottom: 10 }}>Delete Backup?</h3>
                        <p style={{ fontSize: "0.875rem", color: "#94a3b8", lineHeight: 1.6, fontFamily: "monospace", wordBreak: "break-all" }}>{archiveName(deleteTarget.volid)}</p>
                        <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
                            <button onClick={() => setDeleteTarget(null)} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: "#64748b", fontSize: "0.875rem", cursor: "pointer" }}>Cancel</button>
                            <button onClick={handleDelete} disabled={deleting} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: deleting ? "not-allowed" : "pointer" }}>
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
