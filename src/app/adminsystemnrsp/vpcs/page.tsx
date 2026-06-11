"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    Network, Plus, Trash2, Server, RefreshCw, X,
    Link as LinkIcon, Unlink, ChevronRight,
} from "lucide-react";

// Mirror of lib/vpc-subnet VLAN range (kept local — that module is server-only).
const VLAN_MIN = 1001, VLAN_MAX = 2000;

/* ─── Types ─── */

interface VpcVm {
    id: string;
    vmId: string;
    name: string;
    status: string;
    node: string;
    user: { id: string; name: string | null; email: string | null } | null;
}

interface VpcAssignment {
    id: string;
    bridgeName: string;
    ipAddress: string | null;
    assignedAt: string;
    vpsInstance: VpcVm;
}

interface Vpc {
    id: string;
    name: string;
    vlanId: number;
    vnetName: string;
    mikrotikVlanIf: string | null;
    subnet: string;
    gateway: string;
    dhcpStart: string | null;
    dhcpEnd: string | null;
    description: string | null;
    status: string;
    isolate: boolean;
    assignments: VpcAssignment[];
    _count: { assignments: number };
}

interface UnassignedVm {
    id: string;
    vmId: string;
    name: string;
    status: string;
    node: string;
}

/* ─── Component ─── */

export default function VpcsPage() {
    const t = useThemeTokens();
    const [vpcs, setVpcs] = useState<Vpc[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState("");
    const [selectedVpc, setSelectedVpc] = useState<string | null>(null);
    const [deleting, setDeleting] = useState("");
    const [showAssign, setShowAssign] = useState<string | null>(null);
    const [unassignedVms, setUnassignedVms] = useState<UnassignedVm[]>([]);
    const [assignVmId, setAssignVmId] = useState("");
    const [assignIp, setAssignIp] = useState("");
    const [assigning, setAssigning] = useState(false);

    // Form state
    const [form, setForm] = useState({
        name: "", vlanId: "", subnet: "", gateway: "",
        dhcpStart: "", dhcpEnd: "", description: "", isolate: true,
    });

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };

    const loadVpcs = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/vpcs");
            if (res.ok) { const d = await res.json(); setVpcs(d.vpcs ?? []); }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadVpcs(); }, [loadVpcs]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true); setCreateErr("");
        try {
            const res = await fetch("/api/admin/vpcs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name,
                    // Optional override — omitted = auto-allocate.
                    vlanId: form.vlanId ? parseInt(form.vlanId, 10) : undefined,
                    description: form.description,
                    isolate: form.isolate,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setShowCreate(false);
            setForm({ name: "", vlanId: "", subnet: "", gateway: "", dhcpStart: "", dhcpEnd: "", description: "", isolate: true });
            loadVpcs();
        } catch (err) { setCreateErr(err instanceof Error ? err.message : "Failed"); }
        finally { setCreating(false); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this VPC? MikroTik resources will be cleaned up.")) return;
        setDeleting(id);
        try {
            const res = await fetch(`/api/admin/vpcs/${id}`, { method: "DELETE" });
            if (!res.ok) { const d = await res.json(); alert(d.error || "Failed"); }
            else { loadVpcs(); setSelectedVpc(null); }
        } catch { alert("Failed to delete VPC"); }
        finally { setDeleting(""); }
    };

    const openAssign = async (vpcId: string) => {
        setShowAssign(vpcId);
        try {
            const res = await fetch("/api/admin/vpcs");
            if (res.ok) {
                // Get all VMs without VPC assignments — use server list
                const srvRes = await fetch("/api/admin/vpcs/" + vpcId);
                if (srvRes.ok) {
                    // For simplicity, we'll let admin type the VM instance ID
                    setUnassignedVms([]);
                }
            }
        } catch { /* silent */ }
    };

    const handleAssign = async (vpcId: string) => {
        if (!assignVmId) return;
        setAssigning(true);
        try {
            const res = await fetch(`/api/admin/vpcs/${vpcId}/assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vpsInstanceId: assignVmId, ipAddress: assignIp || undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setShowAssign(null); setAssignVmId(""); setAssignIp("");
            loadVpcs();
        } catch (err) { alert(err instanceof Error ? err.message : "Failed"); }
        finally { setAssigning(false); }
    };

    const handleUnassign = async (vpcId: string, vpsInstanceId: string) => {
        if (!confirm("Unassign this VM from the VPC?")) return;
        try {
            const res = await fetch(`/api/admin/vpcs/${vpcId}/assign`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vpsInstanceId }),
            });
            if (!res.ok) { const d = await res.json(); alert(d.error || "Failed"); }
            else { loadVpcs(); }
        } catch { alert("Failed"); }
    };

    const detail = vpcs.find(v => v.id === selectedVpc);

    const inputStyle: React.CSSProperties = {
        width: "100%", padding: "9px 12px", borderRadius: t.isMono ? 4 : 8,
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        color: t.textPrimary, fontSize: "0.85rem", outline: "none", boxSizing: "border-box",
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Admin System <span>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>VPC Networks</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Network style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>VPC Networks</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Create, manage, and assign VPCs with MikroTik integration.</p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button id="vpcs-refresh" onClick={loadVpcs} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                            <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                        </button>
                        <button id="vpcs-create" onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: t.isMono ? 4 : 8, border: "none", background: t.accentPrimary, color: t.textInverse, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}>
                            <Plus style={{ width: 13, height: 13 }} /> New VPC
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                {[
                    { label: "Total VPCs", val: vpcs.length, color: t.accentPrimary },
                    { label: "Active", val: vpcs.filter(v => v.status === "ACTIVE").length, color: t.statusSuccess },
                    { label: "Assigned VMs", val: vpcs.reduce((a, v) => a + v._count.assignments, 0), color: t.statusWarning },
                ].map(s => (
                    <div key={s.label} style={{ padding: "8px 18px", borderRadius: t.isMono ? 4 : 8, background: t.bgCard, border: `1px solid ${t.borderPrimary}`, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.72rem", color: t.textMuted, fontWeight: 600 }}>{s.label}</span>
                        <span style={{ fontSize: "1rem", fontWeight: 800, color: s.color, fontFamily: t.fontMono }}>{s.val}</span>
                    </div>
                ))}
            </div>

            {/* Two-column layout */}
            <div style={{ display: "grid", gridTemplateColumns: detail ? "1fr 1.2fr" : "1fr", gap: 20 }}>
                {/* VPC List */}
                <div style={card}>
                    <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>VPCs</span>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: t.accentPrimaryMuted, color: t.accentPrimary }}>{vpcs.length}</span>
                    </div>
                    {loading ? (
                        <div style={{ padding: "40px 24px", textAlign: "center", color: t.textMuted }}>Loading…</div>
                    ) : vpcs.length === 0 ? (
                        <div style={{ padding: "48px 24px", textAlign: "center", color: t.textMuted, fontSize: "0.88rem" }}>No VPCs created yet.</div>
                    ) : (
                        vpcs.map(vpc => (
                            <div
                                key={vpc.id}
                                onClick={() => setSelectedVpc(vpc.id)}
                                style={{
                                    padding: "14px 24px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                                    borderBottom: `1px solid ${t.borderSecondary}`,
                                    background: selectedVpc === vpc.id ? t.bgCardHover : "transparent",
                                    transition: "background 0.1s",
                                }}
                            >
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>{vpc.name}</span>
                                        <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: t.accentPrimaryMuted, color: t.accentPrimary, fontFamily: t.fontMono }}>VLAN {vpc.vlanId}</span>
                                    </div>
                                    <div style={{ fontSize: "0.75rem", color: t.textMuted, fontFamily: t.fontMono }}>{vpc.subnet} &middot; {vpc._count.assignments} VM{vpc._count.assignments !== 1 ? "s" : ""}</div>
                                </div>
                                <ChevronRight style={{ width: 14, height: 14, color: t.textMuted }} />
                            </div>
                        ))
                    )}
                </div>

                {/* Detail Panel */}
                {detail && (
                    <div style={card}>
                        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: t.textPrimary, marginBottom: 4 }}>{detail.name}</h2>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: detail.status === "ACTIVE" ? t.statusSuccessBg : t.statusErrorBg, color: detail.status === "ACTIVE" ? t.statusSuccess : t.statusError }}>{detail.status}</span>
                                    <span style={{ fontSize: "0.72rem", color: t.textMuted, fontFamily: t.fontMono }}>VLAN {detail.vlanId} &middot; {detail.vnetName}</span>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => openAssign(detail.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: t.isMono ? 4 : 6, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.accentPrimary, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                                    <LinkIcon style={{ width: 12, height: 12 }} /> Assign VM
                                </button>
                                <button onClick={() => handleDelete(detail.id)} disabled={deleting === detail.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: t.isMono ? 4 : 6, border: "none", background: t.statusError, color: "#fff", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", opacity: deleting === detail.id ? 0.5 : 1 }}>
                                    <Trash2 style={{ width: 12, height: 12 }} /> {deleting === detail.id ? "…" : "Delete"}
                                </button>
                            </div>
                        </div>

                        {/* VPC Info */}
                        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: "0.82rem" }}>
                                {[
                                    ["Subnet", detail.subnet],
                                    ["Gateway", detail.gateway],
                                    ["MikroTik IF", detail.mikrotikVlanIf || "—"],
                                    ["Isolated", detail.isolate ? "Yes" : "No"],
                                    ["DHCP Range", detail.dhcpStart && detail.dhcpEnd ? `${detail.dhcpStart} — ${detail.dhcpEnd}` : "Not configured"],
                                    ["Description", detail.description || "—"],
                                ].map(([l, v]) => (
                                    <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${t.borderSecondary}` }}>
                                        <span style={{ color: t.textMuted }}>{l}</span>
                                        <span style={{ color: t.textPrimary, fontFamily: t.fontMono, fontWeight: 500 }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Assigned VMs */}
                        <div style={{ padding: "16px 24px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                <Server style={{ width: 14, height: 14, color: t.textMuted }} />
                                <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.88rem" }}>Assigned VMs</span>
                                <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: t.accentPrimaryMuted, color: t.accentPrimary }}>{detail.assignments.length}</span>
                            </div>
                            {detail.assignments.length === 0 ? (
                                <p style={{ fontSize: "0.82rem", color: t.textMuted, padding: "12px 0" }}>No VMs assigned to this VPC.</p>
                            ) : (
                                detail.assignments.map(a => (
                                    <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: t.isMono ? 4 : 8, background: t.bgSecondary, marginBottom: 6 }}>
                                        <div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span style={{ fontWeight: 600, fontSize: "0.85rem", color: t.textPrimary }}>{a.vpsInstance.name}</span>
                                                <span style={{ fontSize: "0.68rem", color: t.textMuted, fontFamily: t.fontMono }}>#{a.vpsInstance.vmId}</span>
                                            </div>
                                            <div style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 2 }}>
                                                IP: {a.ipAddress || "DHCP"} &middot; {a.vpsInstance.node}
                                                {a.vpsInstance.user && <> &middot; {a.vpsInstance.user.email}</>}
                                            </div>
                                        </div>
                                        <button onClick={() => handleUnassign(detail.id, a.vpsInstance.id)} title="Unassign" style={{ padding: 6, borderRadius: 4, border: "none", background: "transparent", color: t.textMuted, cursor: "pointer" }}>
                                            <Unlink style={{ width: 14, height: 14 }} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Create VPC Modal */}
            {showCreate && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: t.isLight ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                    <div style={{ ...card, width: "100%", maxWidth: 520, padding: 32 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                            <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: t.textPrimary }}>Create VPC</h2>
                            <button onClick={() => setShowCreate(false)} style={{ background: "none", border: "none", color: t.textMuted, cursor: "pointer" }}><X style={{ width: 18, height: 18 }} /></button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", color: t.textMuted, marginBottom: 4, fontWeight: 600 }}>Name</label>
                                    <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="customer-prod" style={inputStyle} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.78rem", color: t.textMuted, marginBottom: 4, fontWeight: 600 }}>VLAN ID (optional, {VLAN_MIN}–{VLAN_MAX})</label>
                                    <input type="number" min={VLAN_MIN} max={VLAN_MAX} value={form.vlanId} onChange={e => setForm({ ...form, vlanId: e.target.value })} placeholder="auto-allocate" style={inputStyle} />
                                </div>
                            </div>
                            <p style={{ fontSize: "0.74rem", color: t.textMuted, marginBottom: 12 }}>
                                Subnet (/28), gateway and DHCP range are auto-allocated from <code>10.50.0.0/16</code>. The VLAN gets its own MikroTik DHCP server.
                            </p>
                            <div>
                                <label style={{ display: "block", fontSize: "0.78rem", color: t.textMuted, marginBottom: 4, fontWeight: 600 }}>Description (optional)</label>
                                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Customer production network" style={{ ...inputStyle, marginBottom: 12 }} />
                            </div>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem", color: t.textSecondary, marginBottom: 16, cursor: "pointer" }}>
                                <input type="checkbox" checked={form.isolate} onChange={e => setForm({ ...form, isolate: e.target.checked })} style={{ accentColor: t.accentPrimary }} />
                                Isolate from management VLAN (recommended)
                            </label>
                            {createErr && <p style={{ color: t.statusError, fontSize: "0.82rem", marginBottom: 12 }}>{createErr}</p>}
                            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: "9px 18px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                                <button type="submit" disabled={creating} style={{ padding: "9px 20px", borderRadius: t.isMono ? 4 : 8, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, cursor: "pointer", opacity: creating ? 0.6 : 1 }}>{creating ? "Creating…" : "Create VPC"}</button>
                            </div>
                        </form>
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
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: "block", fontSize: "0.78rem", color: t.textMuted, marginBottom: 4, fontWeight: 600 }}>VPS Instance ID</label>
                            <input value={assignVmId} onChange={e => setAssignVmId(e.target.value)} placeholder="paste VPS instance ID" style={inputStyle} />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: "block", fontSize: "0.78rem", color: t.textMuted, marginBottom: 4, fontWeight: 600 }}>Static IP (optional)</label>
                            <input value={assignIp} onChange={e => setAssignIp(e.target.value)} placeholder="10.50.1.2" style={inputStyle} />
                        </div>
                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                            <button onClick={() => setShowAssign(null)} style={{ padding: "9px 18px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                            <button onClick={() => handleAssign(showAssign)} disabled={assigning || !assignVmId} style={{ padding: "9px 20px", borderRadius: t.isMono ? 4 : 8, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, cursor: "pointer", opacity: assigning ? 0.6 : 1 }}>{assigning ? "Assigning…" : "Assign"}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
