"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    Globe, Network, Shield, Server, Layers, Plus, Trash2,
    RefreshCw, X, Link as LinkIcon, Unlink,
} from "lucide-react";

/* ─── Types ─── */

interface VpcInfo {
    id: string; name: string; vlanId: number; vnetName: string;
    subnet: string; gateway: string; status: string; createdAt: string;
    _count: { assignments: number };
    assignments?: VpcAssignment[];
}

interface VpsInfo { id: string; vmId: string; name: string; status: string; node: string; }

interface VpcAssignment {
    id: string; bridgeName: string; ipAddress: string | null; assignedAt: string;
    vpc: VpcInfo; vpsInstance: VpsInfo;
}

/* ─── Component ─── */

export default function NetworksPage() {
    const t = useThemeTokens();
    const [assignments, setAssignments] = useState<VpcAssignment[]>([]);
    const [ownedVpcs, setOwnedVpcs] = useState<VpcInfo[]>([]);
    const [unassignedVMs, setUnassignedVMs] = useState<VpsInfo[]>([]);
    const [maxVpcs, setMaxVpcs] = useState(3);
    const [loading, setLoading] = useState(true);

    // Create VPC
    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState("");
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState("");

    // Assign VM
    const [showAssign, setShowAssign] = useState<string | null>(null);
    const [assignVmId, setAssignVmId] = useState("");
    const [assignIp, setAssignIp] = useState("");
    const [assigning, setAssigning] = useState(false);

    // Delete / Unassign
    const [deleting, setDeleting] = useState("");

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };

    const inputStyle: React.CSSProperties = {
        width: "100%", padding: "9px 12px", borderRadius: t.isMono ? 4 : 8,
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        color: t.textPrimary, fontSize: "0.85rem", outline: "none", boxSizing: "border-box",
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [netRes, vpcRes] = await Promise.all([
                fetch("/api/networks"),
                fetch("/api/networks/vpc"),
            ]);
            if (netRes.ok) {
                const d = await netRes.json();
                setAssignments(d.assignments ?? []);
            }
            if (vpcRes.ok) {
                const d = await vpcRes.json();
                setOwnedVpcs(d.vpcs ?? []);
                setUnassignedVMs(d.unassignedVMs ?? []);
                setMaxVpcs(d.maxVpcs ?? 3);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleCreate = async () => {
        if (!createName.trim()) return;
        setCreating(true); setCreateErr("");
        try {
            const res = await fetch("/api/networks/vpc", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: createName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setShowCreate(false); setCreateName("");
            loadData();
        } catch (err) { setCreateErr(err instanceof Error ? err.message : "Failed"); }
        finally { setCreating(false); }
    };

    const handleDelete = async (vpcId: string) => {
        if (!confirm("Delete this VPC? MikroTik resources will be cleaned up.")) return;
        setDeleting(vpcId);
        try {
            const res = await fetch("/api/networks/vpc", {
                method: "DELETE", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vpcId }),
            });
            if (!res.ok) { const d = await res.json(); alert(d.error || "Failed"); }
            else loadData();
        } catch { alert("Failed to delete VPC"); }
        finally { setDeleting(""); }
    };

    const handleAssign = async (vpcId: string) => {
        if (!assignVmId) return;
        setAssigning(true);
        try {
            const res = await fetch("/api/networks/vpc/assign", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vpcId, vpsInstanceId: assignVmId, ipAddress: assignIp || undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setShowAssign(null); setAssignVmId(""); setAssignIp("");
            loadData();
        } catch (err) { alert(err instanceof Error ? err.message : "Failed"); }
        finally { setAssigning(false); }
    };

    const handleUnassign = async (vpcId: string, vpsInstanceId: string) => {
        if (!confirm("Unassign this VM from the VPC?")) return;
        try {
            const res = await fetch("/api/networks/vpc/assign", {
                method: "DELETE", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vpcId, vpsInstanceId }),
            });
            if (!res.ok) { const d = await res.json(); alert(d.error || "Failed"); }
            else loadData();
        } catch { alert("Failed"); }
    };

    const totalVMs = ownedVpcs.reduce((a, v) => a + (v._count?.assignments ?? 0), 0);

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Dashboard <span>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Networks</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Globe style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>VPC Networks</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Create and manage isolated networks for your VMs.</p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button id="networks-refresh" onClick={loadData} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                            <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                        </button>
                        <button id="networks-create-vpc" onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: t.isMono ? 4 : 8, border: "none", background: t.accentPrimary, color: t.textInverse, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}>
                            <Plus style={{ width: 13, height: 13 }} /> New VPC
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                {[
                    { label: "My VPCs", val: `${ownedVpcs.length}/${maxVpcs}`, color: t.accentPrimary },
                    { label: "Assigned VMs", val: String(totalVMs), color: t.statusSuccess },
                    { label: "Unassigned VMs", val: String(unassignedVMs.length), color: t.statusWarning },
                ].map(chip => (
                    <div key={chip.label} style={{ padding: "8px 18px", borderRadius: t.isMono ? 4 : 8, background: t.bgCard, border: `1px solid ${t.borderPrimary}`, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.72rem", color: t.textMuted, fontWeight: 600 }}>{chip.label}</span>
                        <span style={{ fontSize: "1rem", fontWeight: 800, color: chip.color, fontFamily: t.fontMono }}>{chip.val}</span>
                    </div>
                ))}
            </div>

            {/* VPC List */}
            {loading ? (
                <div style={{ ...card, padding: "48px 24px", textAlign: "center", color: t.textMuted }}>Loading…</div>
            ) : ownedVpcs.length === 0 && assignments.length === 0 ? (
                <div style={{ ...card, padding: "64px 24px", textAlign: "center" }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                        <Layers style={{ width: 28, height: 28, color: t.accentPrimary }} />
                    </div>
                    <p style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>No VPC Networks</p>
                    <p style={{ fontSize: "0.83rem", color: t.textMuted, maxWidth: 400, margin: "0 auto 20px" }}>
                        Create a VPC to get an isolated private network with its own VLAN, subnet, and gateway. Then assign your VMs to it.
                    </p>
                    <button onClick={() => setShowCreate(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 22px", borderRadius: t.isMono ? 4 : 8, border: "none", background: t.accentPrimary, color: t.textInverse, fontSize: "0.85rem", fontWeight: 700, cursor: "pointer" }}>
                        <Plus style={{ width: 14, height: 14 }} /> Create Your First VPC
                    </button>
                </div>
            ) : (
                <div style={{ display: "grid", gap: 16 }}>
                    {ownedVpcs.map(vpc => {
                        const vpcAssigns = assignments.filter(a => a.vpc?.id === vpc.id);
                        return (
                            <div key={vpc.id} style={card}>
                                {/* VPC Header */}
                                <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <Network style={{ width: 18, height: 18, color: t.accentPrimary }} />
                                        <div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>{vpc.name}</span>
                                                <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: t.accentPrimaryMuted, color: t.accentPrimary, fontFamily: t.fontMono }}>VLAN {vpc.vlanId}</span>
                                                <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: t.statusSuccessBg, color: t.statusSuccess }}>{vpc.status}</span>
                                            </div>
                                            <div style={{ fontSize: "0.75rem", color: t.textMuted, fontFamily: t.fontMono, marginTop: 2 }}>
                                                {vpc.subnet} &middot; GW {vpc.gateway}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <button onClick={() => { setShowAssign(vpc.id); setAssignVmId(""); setAssignIp(""); }} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: t.isMono ? 4 : 6, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.accentPrimary, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                                            <LinkIcon style={{ width: 12, height: 12 }} /> Assign VM
                                        </button>
                                        <button onClick={() => handleDelete(vpc.id)} disabled={deleting === vpc.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: t.isMono ? 4 : 6, border: `1px solid ${t.statusError}33`, background: t.statusErrorBg, color: t.statusError, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", opacity: deleting === vpc.id ? 0.5 : 1 }}>
                                            <Trash2 style={{ width: 12, height: 12 }} /> {deleting === vpc.id ? "…" : "Delete"}
                                        </button>
                                    </div>
                                </div>

                                {/* Assigned VMs */}
                                <div style={{ padding: "12px 24px" }}>
                                    {vpcAssigns.length === 0 ? (
                                        <p style={{ fontSize: "0.82rem", color: t.textMuted, padding: "8px 0" }}>No VMs assigned. Click &quot;Assign VM&quot; to add one.</p>
                                    ) : (
                                        vpcAssigns.map(a => (
                                            <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: t.isMono ? 4 : 8, background: t.bgSecondary, marginBottom: 6 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <Server style={{ width: 14, height: 14, color: t.textMuted }} />
                                                    <div>
                                                        <span style={{ fontWeight: 600, fontSize: "0.85rem", color: t.textPrimary }}>{a.vpsInstance.name}</span>
                                                        <span style={{ fontSize: "0.72rem", color: t.textMuted, fontFamily: t.fontMono, marginLeft: 6 }}>#{a.vpsInstance.vmId}</span>
                                                        <div style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 2 }}>
                                                            IP: <span style={{ color: t.accentPrimary, fontFamily: t.fontMono }}>{a.ipAddress || "DHCP"}</span> &middot; {a.vpsInstance.node}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleUnassign(vpc.id, a.vpsInstance.id)} title="Unassign" style={{ padding: 6, borderRadius: 4, border: "none", background: "transparent", color: t.textMuted, cursor: "pointer" }}>
                                                    <Unlink style={{ width: 14, height: 14 }} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Show assignments from admin-created VPCs (no userId) */}
                    {assignments.filter(a => !ownedVpcs.some(v => v.id === a.vpc?.id)).length > 0 && (
                        <div style={card}>
                            <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <Shield style={{ width: 16, height: 16, color: t.textMuted }} />
                                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.92rem" }}>Admin-Managed Assignments</span>
                                </div>
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ background: t.bgSecondary }}>
                                        {["VPC", "VLAN", "Subnet", "Assigned IP", "VM"].map(h => (
                                            <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}` }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {assignments.filter(a => !ownedVpcs.some(v => v.id === a.vpc?.id)).map(a => (
                                        <tr key={a.id} style={{ borderBottom: `1px solid ${t.borderSecondary}` }}>
                                            <td style={{ padding: "10px 16px", fontWeight: 600, color: t.textPrimary, fontSize: "0.85rem" }}>{a.vpc.name}</td>
                                            <td style={{ padding: "10px 16px" }}><span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: t.accentPrimaryMuted, color: t.accentPrimary, fontFamily: t.fontMono }}>{a.vpc.vlanId}</span></td>
                                            <td style={{ padding: "10px 16px", fontFamily: t.fontMono, fontSize: "0.82rem", color: t.textSecondary }}>{a.vpc.subnet}</td>
                                            <td style={{ padding: "10px 16px", fontFamily: t.fontMono, fontSize: "0.82rem", color: t.accentPrimary }}>{a.ipAddress || "DHCP"}</td>
                                            <td style={{ padding: "10px 16px", fontSize: "0.82rem", color: t.textPrimary }}>{a.vpsInstance.name} <span style={{ color: t.textMuted, fontFamily: t.fontMono }}>#{a.vpsInstance.vmId}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Create VPC Modal */}
            {showCreate && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: t.isLight ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                    <div style={{ ...card, width: "100%", maxWidth: 440, padding: 32 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                            <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: t.textPrimary }}>Create VPC</h2>
                            <button onClick={() => { setShowCreate(false); setCreateErr(""); }} style={{ background: "none", border: "none", color: t.textMuted, cursor: "pointer" }}><X style={{ width: 18, height: 18 }} /></button>
                        </div>
                        <p style={{ fontSize: "0.82rem", color: t.textMuted, marginBottom: 16 }}>
                            A VLAN, subnet, and gateway will be auto-allocated. Just give it a name.
                        </p>
                        <input value={createName} onChange={e => setCreateName(e.target.value)} placeholder="e.g. Production, Dev, Staging" maxLength={50} style={{ ...inputStyle, marginBottom: 16 }} onKeyDown={e => e.key === "Enter" && handleCreate()} />
                        {createErr && <p style={{ color: t.statusError, fontSize: "0.82rem", marginBottom: 12 }}>{createErr}</p>}
                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                            <button onClick={() => { setShowCreate(false); setCreateErr(""); }} style={{ padding: "9px 18px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleCreate} disabled={creating || !createName.trim()} style={{ padding: "9px 20px", borderRadius: t.isMono ? 4 : 8, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, cursor: "pointer", opacity: creating || !createName.trim() ? 0.5 : 1 }}>{creating ? "Creating…" : "Create VPC"}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign VM Modal */}
            {showAssign && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: t.isLight ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                    <div style={{ ...card, width: "100%", maxWidth: 440, padding: 32 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: t.textPrimary }}>Assign VM to VPC</h2>
                            <button onClick={() => setShowAssign(null)} style={{ background: "none", border: "none", color: t.textMuted, cursor: "pointer" }}><X style={{ width: 18, height: 18 }} /></button>
                        </div>
                        {unassignedVMs.length === 0 ? (
                            <p style={{ fontSize: "0.85rem", color: t.textMuted, padding: "16px 0" }}>All your VMs are already assigned to a VPC.</p>
                        ) : (
                            <>
                                <div style={{ marginBottom: 12 }}>
                                    <label style={{ display: "block", fontSize: "0.78rem", color: t.textMuted, marginBottom: 4, fontWeight: 600 }}>Select VM</label>
                                    <select value={assignVmId} onChange={e => setAssignVmId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                                        <option value="">— Choose a VM —</option>
                                        {unassignedVMs.map(vm => (
                                            <option key={vm.id} value={vm.id}>{vm.name} (#{vm.vmId} · {vm.node})</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: "block", fontSize: "0.78rem", color: t.textMuted, marginBottom: 4, fontWeight: 600 }}>Static IP (optional)</label>
                                    <input value={assignIp} onChange={e => setAssignIp(e.target.value)} placeholder="Leave blank for DHCP" style={inputStyle} />
                                </div>
                            </>
                        )}
                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                            <button onClick={() => setShowAssign(null)} style={{ padding: "9px 18px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                            {unassignedVMs.length > 0 && (
                                <button onClick={() => handleAssign(showAssign)} disabled={assigning || !assignVmId} style={{ padding: "9px 20px", borderRadius: t.isMono ? 4 : 8, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, cursor: "pointer", opacity: assigning || !assignVmId ? 0.5 : 1 }}>{assigning ? "Assigning…" : "Assign"}</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
