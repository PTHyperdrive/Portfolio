"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Camera, AlertTriangle } from "lucide-react";

interface VpsInstance { id: string; vmId: string; name: string; node: string; status: string; }
interface Snapshot { name: string; description: string; snaptime: number; vmstate: number; parent?: string; }

function formatTs(ts: number) {
    return new Date(ts * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function SubNav({ active }: { active: "snapshots" | "backups" | "isos" }) {
    const tabs = [
        { label: "Snapshots", href: "/dashboard/orchestration/snapshots" },
        { label: "Backups",   href: "/dashboard/orchestration/backups"   },
        { label: "ISOs",      href: "/dashboard/orchestration/isos"      },
    ] as const;
    return (
        <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 0 }}>
            {tabs.map(t => (
                <Link key={t.label} href={t.href} style={{
                    padding: "8px 18px", borderRadius: "8px 8px 0 0", textDecoration: "none",
                    fontSize: "0.875rem", fontWeight: 600,
                    color: active === t.label.toLowerCase() ? "#f1f5f9" : "#475569",
                    borderBottom: active === t.label.toLowerCase() ? "2px solid #3b82f6" : "2px solid transparent",
                    background: active === t.label.toLowerCase() ? "rgba(59,130,246,0.06)" : "transparent",
                    transition: "all 0.15s",
                }}>
                    {t.label}
                </Link>
            ))}
        </div>
    );
}

export default function SnapshotsPage() {
    const [vms, setVms] = useState<VpsInstance[]>([]);
    const [selectedVm, setSelectedVm] = useState("");
    const [selectedNode, setSelectedNode] = useState("");
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [snapLoading, setSnapLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Form
    const [snapname, setSnapname] = useState("");
    const [description, setDescription] = useState("");
    const [includeRam, setIncludeRam] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Delete / rollback confirmation
    const [confirm, setConfirm] = useState<{ snap: Snapshot; action: "delete" | "rollback" } | null>(null);
    const [confirming, setConfirming] = useState(false);

    useEffect(() => {
        fetch("/api/proxmox/vms?limit=50")
            .then(r => r.json())
            .then(d => {
                const list: VpsInstance[] = d.instances ?? [];
                setVms(list);
                if (list[0]) { setSelectedVm(list[0].vmId); setSelectedNode(list[0].node); }
            })
            .catch(() => setError("Failed to load VMs."))
            .finally(() => setLoading(false));
    }, []);

    const loadSnaps = useCallback(async (vmId: string) => {
        if (!vmId) return;
        setSnapLoading(true); setSnapshots([]);
        try {
            const res = await fetch(`/api/vps/${vmId}/snapshots`);
            if (!res.ok) throw new Error("Failed to load snapshots.");
            const data = await res.json();
            setSnapshots(data.snapshots ?? []);
        } catch (err) { setError(err instanceof Error ? err.message : "Failed."); }
        finally { setSnapLoading(false); }
    }, []);

    useEffect(() => { if (selectedVm) loadSnaps(selectedVm); }, [selectedVm, loadSnaps]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault(); setSubmitting(true); setError("");
        const res = await fetch(`/api/vps/${selectedVm}/snapshots`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snapname, description, includeRam }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed."); setSubmitting(false); return; }
        setSuccess(`Snapshot "${snapname}" creation queued.`);
        setSnapname(""); setDescription(""); setIncludeRam(false);
        setTimeout(() => loadSnaps(selectedVm), 3000);
        setSubmitting(false);
    };

    const handleConfirm = async () => {
        if (!confirm) return;
        setConfirming(true); setError("");
        const method = confirm.action === "delete" ? "DELETE" : "PATCH";
        const res = await fetch(`/api/vps/${selectedVm}/snapshots`, {
            method, headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snapname: confirm.snap.name }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed."); }
        else { setSuccess(confirm.action === "delete" ? `Snapshot "${confirm.snap.name}" deleted.` : `Rolled back to "${confirm.snap.name}". VM will restart.`); }
        setConfirm(null); setConfirming(false); loadSnaps(selectedVm);
    };

    const bg = "#0d1117";
    const card: React.CSSProperties = { background: "#161b22", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14 };
    const input: React.CSSProperties = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, color: "#e2e8f0", fontSize: "0.875rem", outline: "none", padding: "9px 13px", width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit" };
    const sel: React.CSSProperties   = { ...input, cursor: "pointer" };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: bg }}>
            <div style={{ marginBottom: 6 }}>
                <p style={{ fontSize: "0.78rem", color: "#475569" }}>Dashboard&nbsp;•&nbsp;Orchestration</p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f1f5f9", marginTop: 4 }}>Orchestration</h1>
            </div>

            <SubNav active="snapshots" />

            {/* Toasts */}
            {success && <div style={{ padding: "12px 16px", borderRadius: 9, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#10b981", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>{success}<button onClick={() => setSuccess("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button></div>}
            {error   && <div style={{ padding: "12px 16px", borderRadius: 9, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>{error}<button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button></div>}

            {loading ? (
                <div style={{ padding: 60, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", gap: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
                    Loading VMs…
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* VM Selector */}
                    <div style={{ ...card, padding: "18px 24px", display: "flex", alignItems: "center", gap: 16 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                        <select id="snap-vm-select" value={selectedVm} onChange={e => { const vm = vms.find(v => v.vmId === e.target.value); if (vm) { setSelectedVm(vm.vmId); setSelectedNode(vm.node); } }} style={{ ...sel, maxWidth: 360 }}>
                            {vms.map(vm => <option key={vm.vmId} value={vm.vmId}>VM #{vm.vmId} — {vm.name} ({vm.node})</option>)}
                        </select>
                        <span style={{ fontSize: "0.78rem", color: "#334155", fontFamily: "monospace" }}>node: {selectedNode}</span>
                    </div>

                    {/* Create Snapshot */}
                    <div style={{ ...card, padding: "24px 28px" }}>
                        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 16 }}>
                            Create Snapshot
                        </h2>
                        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Snapshot Name *</label>
                                    <input id="snap-name-input" value={snapname} onChange={e => setSnapname(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} placeholder="e.g. before_update" required style={input} />
                                    <p style={{ fontSize: "0.68rem", color: "#334155", marginTop: 4 }}>a-z, 0-9, _ and - only · max 40 chars</p>
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Description</label>
                                    <input id="snap-desc-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional note about this snapshot" style={input} />
                                </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                                    <div onClick={() => setIncludeRam(v => !v)} style={{ width: 40, height: 22, borderRadius: 11, background: includeRam ? "#8b5cf6" : "rgba(255,255,255,0.08)", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                                        <div style={{ position: "absolute", top: 3, left: includeRam ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: "0.84rem", color: "#94a3b8", fontWeight: 600 }}>Include RAM state</span>
                                        <p style={{ fontSize: "0.72rem", color: "#475569", marginTop: 1 }}>Captures live memory — larger snapshot, VM stays running</p>
                                    </div>
                                </label>
                                <button type="submit" id="btn-create-snapshot" disabled={submitting || !selectedVm}
                                    style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: submitting ? "#1e3a5f" : "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: submitting ? "not-allowed" : "pointer" }}>
                                    {submitting ? "Creating…" : "Create Snapshot"}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Snapshot List */}
                    <div style={card}>
                        <div style={{ padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h2 style={{ fontSize: "0.9rem", fontWeight: 700, color: "#94a3b8" }}>
                                Existing Snapshots
                                {snapshots.length > 0 && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 10, fontSize: "0.65rem", fontWeight: 700, background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>{snapshots.length}</span>}
                            </h2>
                            <button onClick={() => loadSnaps(selectedVm)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#475569", padding: "5px 12px", fontSize: "0.75rem", cursor: "pointer" }}>Refresh</button>
                        </div>

                        {snapLoading ? (
                            <div style={{ padding: 32, textAlign: "center", color: "#334155", fontSize: "0.875rem" }}>Loading…</div>
                        ) : snapshots.length === 0 ? (
                            <div style={{ padding: "40px", textAlign: "center", color: "#334155", fontSize: "0.875rem" }}>No snapshots yet.</div>
                        ) : (
                            snapshots.map((snap, idx) => (
                                <div key={snap.name} style={{ display: "grid", gridTemplateColumns: "200px 1fr 160px 80px auto", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: idx < snapshots.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.018)"}
                                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                                    <div>
                                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#e2e8f0", fontSize: "0.875rem" }}>{snap.name}</span>
                                        {snap.vmstate === 1 && <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, fontSize: "0.6rem", fontWeight: 700, background: "rgba(139,92,246,0.15)", color: "#8b5cf6" }}>+RAM</span>}
                                    </div>
                                    <span style={{ fontSize: "0.8rem", color: "#475569" }}>{snap.description || "—"}</span>
                                    <span style={{ fontSize: "0.75rem", color: "#334155" }}>{snap.snaptime ? formatTs(snap.snaptime) : "—"}</span>
                                    <span style={{ fontSize: "0.72rem", color: "#334155", fontFamily: "monospace" }}>{snap.parent ? `← ${snap.parent}` : "root"}</span>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <button title="Rollback to this snapshot" onClick={() => setConfirm({ snap, action: "rollback" })}
                                            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(245,158,11,0.25)", background: "rgba(245,158,11,0.07)", color: "#f59e0b", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>
                                            ↩ Rollback
                                        </button>
                                        <button title="Delete snapshot" onClick={() => setConfirm({ snap, action: "delete" })}
                                            style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Confirm modal */}
            {confirm && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                    <div style={{ ...card, padding: "28px 32px", width: 420, borderColor: confirm.action === "rollback" ? "rgba(245,158,11,0.25)" : "rgba(239,68,68,0.25)" }}>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f1f5f9", marginBottom: 10 }}>
                            {confirm.action === "rollback" ? "Rollback VM?" : "Delete Snapshot?"}
                        </h3>
                        <p style={{ fontSize: "0.875rem", color: "#94a3b8", lineHeight: 1.6 }}>
                            {confirm.action === "rollback"
                                ? <>Rolling back to <strong style={{ color: "#f1f5f9" }}>"{confirm.snap.name}"</strong> will stop the VM and revert all disk state. Any changes since this snapshot will be <strong style={{ color: "#ef4444" }}>permanently lost</strong>.</>
                                : <>This will permanently delete snapshot <strong style={{ color: "#f1f5f9" }}>"{confirm.snap.name}"</strong>. This cannot be undone.</>
                            }
                        </p>
                        <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
                            <button onClick={() => setConfirm(null)} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: "#64748b", fontSize: "0.875rem", cursor: "pointer" }}>Cancel</button>
                            <button onClick={handleConfirm} disabled={confirming}
                                style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: confirm.action === "rollback" ? "#d97706" : "#ef4444", color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: confirming ? "not-allowed" : "pointer" }}>
                                {confirming ? "Working…" : confirm.action === "rollback" ? "Yes, Rollback" : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
