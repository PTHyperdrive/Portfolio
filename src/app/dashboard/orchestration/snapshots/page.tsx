"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Server, Trash2, RotateCcw, RefreshCw } from "lucide-react";
import { useThemeTokens } from "@/lib/useThemeTokens";

interface VpsInstance { id: string; vmId: string; name: string; node: string; status: string; }
interface Snapshot { name: string; description: string; snaptime: number; vmstate: number; parent?: string; }

function formatTs(ts: number) {
    return new Date(ts * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

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

export default function SnapshotsPage() {
    const t = useThemeTokens();
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

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const input: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "0.875rem", outline: "none", padding: "9px 13px", width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit" };
    const sel: React.CSSProperties   = { ...input, cursor: "pointer" };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <div style={{ marginBottom: 6 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted }}>Dashboard&nbsp;•&nbsp;Orchestration</p>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary, marginTop: 4 }}>Orchestration</h1>
            </div>

            <SubNav active="snapshots" />

            {/* Toasts */}
            {success && <div style={{ padding: "12px 16px", borderRadius: t.buttonRadius, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>{success}<button onClick={() => setSuccess("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button></div>}
            {error   && <div style={{ padding: "12px 16px", borderRadius: t.buttonRadius, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>{error}<button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button></div>}

            {loading ? (
                <div style={{ padding: 60, display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, gap: 10 }}>
                    <RefreshCw style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                    Loading VMs…
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* VM Selector */}
                    <div style={{ ...card, padding: "18px 24px", display: "flex", alignItems: "center", gap: 16 }}>
                        <Server style={{ width: 18, height: 18, color: t.accentPrimary }} />
                        <select id="snap-vm-select" value={selectedVm} onChange={e => { const vm = vms.find(v => v.vmId === e.target.value); if (vm) { setSelectedVm(vm.vmId); setSelectedNode(vm.node); } }} style={{ ...sel, maxWidth: 360 }}>
                            {vms.map(vm => <option key={vm.vmId} value={vm.vmId}>VM #{vm.vmId} — {vm.name} ({vm.node})</option>)}
                        </select>
                        <span style={{ fontSize: "0.78rem", color: t.textMuted, fontFamily: t.fontMono }}>node: {selectedNode}</span>
                    </div>

                    {/* Create Snapshot */}
                    <div style={{ ...card, padding: "24px 28px" }}>
                        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 16 }}>
                            Create Snapshot
                        </h2>
                        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Snapshot Name *</label>
                                    <input id="snap-name-input" value={snapname} onChange={e => setSnapname(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} placeholder="e.g. before_update" required style={input} />
                                    <p style={{ fontSize: "0.68rem", color: t.textMuted, marginTop: 4 }}>a-z, 0-9, _ and - only · max 40 chars</p>
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Description</label>
                                    <input id="snap-desc-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional note about this snapshot" style={input} />
                                </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                                    <div onClick={() => setIncludeRam(v => !v)} style={{ width: 40, height: 22, borderRadius: 11, background: includeRam ? t.accentPrimary : `${t.textMuted}33`, position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                                        <div style={{ position: "absolute", top: 3, left: includeRam ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: "0.84rem", color: t.textSecondary, fontWeight: 600 }}>Include RAM state</span>
                                        <p style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 1 }}>Captures live memory — larger snapshot, VM stays running</p>
                                    </div>
                                </label>
                                <button type="submit" id="btn-create-snapshot" disabled={submitting || !selectedVm}
                                    style={{ padding: "9px 24px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: submitting || !selectedVm ? "not-allowed" : "pointer", opacity: submitting || !selectedVm ? 0.5 : 1 }}>
                                    {submitting ? "Creating…" : "Create Snapshot"}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Snapshot List */}
                    <div style={card}>
                        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h2 style={{ fontSize: "0.9rem", fontWeight: 700, color: t.textSecondary, display: "flex", alignItems: "center", gap: 8 }}>
                                Existing Snapshots
                                {snapshots.length > 0 && <span style={{ padding: "1px 8px", borderRadius: 10, fontSize: "0.65rem", fontWeight: 700, background: t.accentPrimaryMuted, color: t.accentPrimary }}>{snapshots.length}</span>}
                            </h2>
                            <button onClick={() => loadSnaps(selectedVm)} style={{ background: "none", border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textSecondary, padding: "5px 12px", fontSize: "0.75rem", cursor: "pointer" }}>Refresh</button>
                        </div>

                        {snapLoading ? (
                            <div style={{ padding: 32, textAlign: "center", color: t.textMuted, fontSize: "0.875rem" }}>Loading…</div>
                        ) : snapshots.length === 0 ? (
                            <div style={{ padding: "40px", textAlign: "center", color: t.textMuted, fontSize: "0.875rem" }}>No snapshots yet.</div>
                        ) : (
                            snapshots.map((snap, idx) => (
                                <div key={snap.name} style={{ display: "grid", gridTemplateColumns: "200px 1fr 160px 80px auto", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: idx < snapshots.length - 1 ? `1px solid ${t.borderSecondary}` : "none" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = t.bgCardHover}
                                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                                    <div>
                                        <span style={{ fontFamily: t.fontMono, fontWeight: 700, color: t.textPrimary, fontSize: "0.875rem" }}>{snap.name}</span>
                                        {snap.vmstate === 1 && <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, fontSize: "0.6rem", fontWeight: 700, background: t.accentPrimaryMuted, color: t.accentPrimary }}>+RAM</span>}
                                    </div>
                                    <span style={{ fontSize: "0.8rem", color: t.textMuted }}>{snap.description || "—"}</span>
                                    <span style={{ fontSize: "0.75rem", color: t.textMuted }}>{snap.snaptime ? formatTs(snap.snaptime) : "—"}</span>
                                    <span style={{ fontSize: "0.72rem", color: t.textMuted, fontFamily: t.fontMono }}>{snap.parent ? `← ${snap.parent}` : "root"}</span>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <button title="Rollback to this snapshot" onClick={() => setConfirm({ snap, action: "rollback" })}
                                            style={{ padding: "5px 10px", borderRadius: t.buttonRadius, border: `1px solid ${t.statusWarning}44`, background: t.statusWarningBg, color: t.statusWarning, fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                            <RotateCcw style={{ width: 12, height: 12 }} /> Rollback
                                        </button>
                                        <button title="Delete snapshot" onClick={() => setConfirm({ snap, action: "delete" })}
                                            style={{ width: 30, height: 30, borderRadius: t.buttonRadius, border: `1px solid ${t.statusError}33`, background: t.statusErrorBg, color: t.statusError, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            <Trash2 style={{ width: 13, height: 13 }} />
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
                <div style={{ position: "fixed", inset: 0, background: t.isLight ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                    <div style={{ ...card, padding: "28px 32px", width: 420, border: `1px solid ${confirm.action === "rollback" ? `${t.statusWarning}44` : `${t.statusError}44`}` }}>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: t.textPrimary, marginBottom: 10 }}>
                            {confirm.action === "rollback" ? "Rollback VM?" : "Delete Snapshot?"}
                        </h3>
                        <p style={{ fontSize: "0.875rem", color: t.textSecondary, lineHeight: 1.6 }}>
                            {confirm.action === "rollback"
                                ? <>Rolling back to <strong style={{ color: t.textPrimary }}>&quot;{confirm.snap.name}&quot;</strong> will stop the VM and revert all disk state. Any changes since this snapshot will be <strong style={{ color: t.statusError }}>permanently lost</strong>.</>
                                : <>This will permanently delete snapshot <strong style={{ color: t.textPrimary }}>&quot;{confirm.snap.name}&quot;</strong>. This cannot be undone.</>
                            }
                        </p>
                        <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
                            <button onClick={() => setConfirm(null)} style={{ padding: "9px 20px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontSize: "0.875rem", cursor: "pointer" }}>Cancel</button>
                            <button onClick={handleConfirm} disabled={confirming}
                                style={{ padding: "9px 20px", borderRadius: t.buttonRadius, border: "none", background: confirm.action === "rollback" ? t.statusWarning : t.statusError, color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: confirming ? "not-allowed" : "pointer" }}>
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
