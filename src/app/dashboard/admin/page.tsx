"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Shield, Users, Activity, Server, RefreshCw,
    Edit3, X, AlertTriangle, Rocket,
    ChevronDown, Search
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface VpsInstance {
    id: string;
    vmId: string;
    node: string;
    name: string;
    os: string;
    status: string;
    specs: Record<string, unknown> | null;
    ticketId: string | null;
}

interface AdminUser {
    id: string;
    name: string | null;
    email: string;
    role: string;
    credits: number;
    createdAt: string;
    _count: { orders: number; vpsInstances: number };
    vpsInstances: VpsInstance[];
}

interface LogEntry {
    id: string;
    action: string;
    service: string;
    status: string;
    ipAddress: string | null;
    details: Record<string, unknown> | null;
    createdAt: string;
    user: { id: string; email: string; name: string | null };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const statusColor = (s: string) =>
    s === "Success" || s === "running"
        ? { bg: "rgba(16,185,129,0.15)", color: "#10b981" }
        : s === "provisioning"
            ? { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" }
            : { bg: "rgba(239,68,68,0.15)", color: "#ef4444" };

const serviceColor = (s: string): string => {
    const map: Record<string, string> = {
        Compute: "#3b82f6", Auth: "#8b5cf6", Billing: "#f59e0b",
        VPN: "#06b6d4", Network: "#10b981",
    };
    return map[s] ?? "#64748b";
};

function fmt(s: string) {
    return new Date(s).toLocaleString("en-US", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

// ── Shared card style ─────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
    background: "#161b22",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    overflow: "hidden",
};

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }} onClick={onClose}>
            <div style={{
                background: "#161b22", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 16, padding: 28, width: "100%", maxWidth: 500,
                boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <p style={{ fontWeight: 800, fontSize: "1rem", color: "#f1f5f9" }}>{title}</p>
                    <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// ── Reassign VM Modal ─────────────────────────────────────────────────────────

function ReassignModal({
    vm, users, onClose, onSuccess,
}: { vm: VpsInstance; users: AdminUser[]; onClose: () => void; onSuccess: () => void }) {
    const [newUserId, setNewUserId] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const submit = async () => {
        if (!newUserId) { setErr("Please select a user"); return; }
        setLoading(true); setErr("");
        try {
            const res = await fetch(`/api/admin/vms/${vm.id}/assign`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newUserId }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error ?? "Failed");
            onSuccess();
            onClose();
        } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
        finally { setLoading(false); }
    };

    return (
        <Modal title={`Reassign VM — ${vm.name}`} onClose={onClose}>
            <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: 16 }}>
                Select the new owner for this VM. The linked deployment ticket (if any) will also be reassigned.
            </p>
            <label style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, fontWeight: 700 }}>
                New Owner
            </label>
            <select
                value={newUserId}
                onChange={e => setNewUserId(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, color: "#e2e8f0", fontSize: "0.875rem", marginBottom: 20, outline: "none" }}
            >
                <option value="" style={{ background: "#1e293b" }}>— Select user —</option>
                {users.map(u => (
                    <option key={u.id} value={u.id} style={{ background: "#1e293b" }}>
                        {u.email} {u.name ? `(${u.name})` : ""}
                    </option>
                ))}
            </select>
            {err && <p style={{ fontSize: "0.8rem", color: "#ef4444", marginBottom: 12 }}>⚠ {err}</p>}
            <div style={{ display: "flex", gap: 10 }}>
                <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "0.875rem" }}>
                    Cancel
                </button>
                <button onClick={submit} disabled={loading} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff", cursor: loading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "0.875rem" }}>
                    {loading ? "Reassigning…" : "Confirm Reassign"}
                </button>
            </div>
        </Modal>
    );
}

// ── Edit Log Modal ────────────────────────────────────────────────────────────

function EditLogModal({ log, onClose, onSuccess }: { log: LogEntry; onClose: () => void; onSuccess: () => void }) {
    const [action, setAction] = useState(log.action);
    const [status, setStatus] = useState(log.status);
    const [detailsStr, setDetailsStr] = useState(log.details ? JSON.stringify(log.details, null, 2) : "");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [jsonErr, setJsonErr] = useState("");

    const submit = async () => {
        setLoading(true); setErr(""); setJsonErr("");
        let details: unknown = undefined;
        if (detailsStr.trim()) {
            try { details = JSON.parse(detailsStr); }
            catch { setJsonErr("Invalid JSON in Details field"); setLoading(false); return; }
        }
        try {
            const res = await fetch(`/api/admin/logs/${log.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, status, ...(detailsStr.trim() ? { details } : {}) }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error ?? "Failed");
            onSuccess();
            onClose();
        } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
        finally { setLoading(false); }
    };

    const field: React.CSSProperties = {
        width: "100%", padding: "9px 12px",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 9, color: "#e2e8f0", fontSize: "0.875rem",
        outline: "none", boxSizing: "border-box",
    };

    return (
        <Modal title="Edit Activity Log" onClose={onClose}>
            {/* Red warning */}
            <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: 18 }}>
                <AlertTriangle size={16} style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: "0.78rem", color: "#ef4444", lineHeight: 1.5 }}>
                    <strong>Warning:</strong> Modifying audit logs is not recommended unless redacting sensitive security data.
                </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6, fontWeight: 700 }}>Action</label>
                    <input value={action} onChange={e => setAction(e.target.value)} style={field} />
                </div>
                <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6, fontWeight: 700 }}>Status</label>
                    <input value={status} onChange={e => setStatus(e.target.value)} style={field} />
                </div>
                <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6, fontWeight: 700 }}>Details (JSON)</label>
                    <textarea
                        value={detailsStr}
                        onChange={e => { setDetailsStr(e.target.value); setJsonErr(""); }}
                        rows={5}
                        style={{ ...field, fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" }}
                    />
                    {jsonErr && <p style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: 4 }}>⚠ {jsonErr}</p>}
                </div>
            </div>

            {err && <p style={{ fontSize: "0.8rem", color: "#ef4444", marginTop: 12 }}>⚠ {err}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "0.875rem" }}>
                    Cancel
                </button>
                <button onClick={submit} disabled={loading} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#ef4444,#b91c1c)", color: "#fff", cursor: loading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "0.875rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <Edit3 size={14} />
                    {loading ? "Saving…" : "Save Changes"}
                </button>
            </div>
        </Modal>
    );
}

// ── Tab: Users & VMs ──────────────────────────────────────────────────────────

function UsersVmsTab() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [search, setSearch] = useState("");
    const [reassignTarget, setReassignTarget] = useState<VpsInstance | null>(null);
    const [expandedUser, setExpandedUser] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setErr("");
        try {
            const res = await fetch("/api/admin/accounts");
            const d = await res.json();
            if (!res.ok) throw new Error(d.error ?? "Failed to load");
            setUsers(d.users ?? []);
        } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.name ?? "").toLowerCase().includes(search.toLowerCase())
    );

    const allVms = filteredUsers.flatMap(u =>
        u.vpsInstances.map(vm => ({ ...vm, userEmail: u.email, userId: u.id }))
    );

    return (
        <div>
            {/* Header bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
                <Link
                    href="/dashboard/compute/new"
                    style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "10px 18px", borderRadius: 10,
                        background: "linear-gradient(135deg,#10b981,#059669)",
                        color: "#fff", fontWeight: 700, fontSize: "0.875rem",
                        textDecoration: "none",
                        boxShadow: "0 4px 20px rgba(16,185,129,0.3)",
                    }}
                >
                    <Rocket size={16} />
                    Deploy VM (Admin Override)
                </Link>
                <div style={{ display: "flex", gap: 10, flex: 1, maxWidth: 320, position: "relative" }}>
                    <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#64748b", pointerEvents: "none" }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Filter users…"
                        style={{ width: "100%", paddingLeft: 36, padding: "9px 12px 9px 36px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9, color: "#e2e8f0", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
                    />
                </div>
                <button onClick={load} title="Refresh" style={{ padding: 10, borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#64748b", cursor: "pointer" }}>
                    <RefreshCw size={16} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
                </button>
            </div>

            {err && <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", borderRadius: 9, color: "#ef4444", fontSize: "0.85rem", marginBottom: 16 }}>{err}</div>}

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
                {[
                    { label: "Total Users", value: users.length, color: "#3b82f6", icon: <Users size={18} color="#3b82f6" /> },
                    { label: "All VMs", value: allVms.length, color: "#8b5cf6", icon: <Server size={18} color="#8b5cf6" /> },
                    { label: "Running VMs", value: allVms.filter(v => v.status === "running").length, color: "#10b981", icon: <Activity size={18} color="#10b981" /> },
                ].map(s => (
                    <div key={s.label} style={{ ...CARD, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.icon}</div>
                        <div>
                            <p style={{ fontSize: "1.3rem", fontWeight: 800, color: "#f1f5f9", lineHeight: 1 }}>{s.value}</p>
                            <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 3 }}>{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* VM Table */}
            <div style={CARD}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
                    <Server size={16} color="#3b82f6" />
                    <p style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.9rem" }}>All Virtual Machines</p>
                    <span style={{ marginLeft: "auto", padding: "2px 10px", borderRadius: 20, background: "rgba(59,130,246,0.12)", color: "#3b82f6", fontSize: "0.72rem", fontWeight: 700 }}>
                        {allVms.length} total
                    </span>
                </div>

                {loading ? (
                    <div style={{ padding: 60, textAlign: "center", color: "#475569" }}>Loading…</div>
                ) : allVms.length === 0 ? (
                    <div style={{ padding: 60, textAlign: "center", color: "#475569" }}>No VMs found.</div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                                {["VM Name", "Owner", "Node", "OS", "Status", "Actions"].map(h => (
                                    <th key={h} style={{ padding: "11px 18px", textAlign: "left", fontSize: "0.72rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {allVms.map(vm => {
                                const sc = statusColor(vm.status);
                                return (
                                    <tr key={vm.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.1s" }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                        <td style={{ padding: "13px 18px" }}>
                                            <p style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.875rem" }}>{vm.name}</p>
                                            <p style={{ fontSize: "0.72rem", color: "#475569", fontFamily: "monospace" }}>VMID {vm.vmId}</p>
                                        </td>
                                        <td style={{ padding: "13px 18px", fontSize: "0.82rem", color: "#94a3b8" }}>
                                            {(vm as { userEmail?: string }).userEmail}
                                        </td>
                                        <td style={{ padding: "13px 18px", fontSize: "0.82rem", color: "#94a3b8", fontFamily: "monospace" }}>{vm.node}</td>
                                        <td style={{ padding: "13px 18px", fontSize: "0.82rem", color: "#94a3b8" }}>{vm.os}</td>
                                        <td style={{ padding: "13px 18px" }}>
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20, background: sc.bg, color: sc.color, fontSize: "0.75rem", fontWeight: 700 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.color }} />
                                                {vm.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: "13px 18px" }}>
                                            <button
                                                onClick={() => setReassignTarget(vm)}
                                                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, transition: "all 0.15s" }}
                                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3b82f6"; (e.currentTarget as HTMLButtonElement).style.color = "#3b82f6"; }}
                                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; }}
                                            >
                                                <Users size={13} />
                                                Reassign
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* User directory — collapsible */}
            <div style={{ ...CARD, marginTop: 20 }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
                    <Users size={16} color="#8b5cf6" />
                    <p style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.9rem" }}>User Directory</p>
                    <span style={{ marginLeft: "auto", padding: "2px 10px", borderRadius: 20, background: "rgba(139,92,246,0.12)", color: "#8b5cf6", fontSize: "0.72rem", fontWeight: 700 }}>
                        {filteredUsers.length} users
                    </span>
                </div>
                <div>
                    {filteredUsers.map((u) => (
                        <div key={u.id}>
                            <div
                                onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                                style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.1s" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                                <div style={{ width: 32, height: 32, borderRadius: "50%", background: u.role === "ADMIN" ? "linear-gradient(135deg,#f59e0b,#d97706)" : "linear-gradient(135deg,#8b5cf6,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                                    {(u.name ?? u.email)[0].toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <p style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.875rem" }}>{u.email}</p>
                                    <p style={{ fontSize: "0.72rem", color: "#64748b" }}>{u.name ?? "—"} · {u._count.vpsInstances} VMs · {(u.credits ?? 0).toLocaleString()} Credits</p>
                                </div>
                                {u.role === "ADMIN" && (
                                    <span style={{ padding: "2px 8px", borderRadius: 20, background: "rgba(245,158,11,0.15)", color: "#f59e0b", fontSize: "0.65rem", fontWeight: 800 }}>ADMIN</span>
                                )}
                                <ChevronDown size={15} style={{ color: "#475569", transform: expandedUser === u.id ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                            </div>
                            {expandedUser === u.id && u.vpsInstances.length > 0 && (
                                <div style={{ paddingLeft: 66, paddingRight: 20, paddingBottom: 12, background: "rgba(139,92,246,0.03)" }}>
                                    {u.vpsInstances.map(vm => (
                                        <div key={vm.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                            <Server size={13} color="#475569" />
                                            <span style={{ fontSize: "0.8rem", color: "#94a3b8", flex: 1 }}>{vm.name} <span style={{ color: "#475569" }}>({vm.os})</span></span>
                                            <button onClick={e => { e.stopPropagation(); setReassignTarget(vm); }} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: "0.72rem" }}>
                                                Reassign
                                            </button>
                                        </div>
                                    ))}
                                    {u.vpsInstances.length === 0 && <p style={{ fontSize: "0.8rem", color: "#475569", padding: "8px 0" }}>No VMs</p>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {reassignTarget && (
                <ReassignModal
                    vm={reassignTarget}
                    users={users.filter(u => u.id !== (reassignTarget as { userId?: string }).userId)}
                    onClose={() => setReassignTarget(null)}
                    onSuccess={load}
                />
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ── Tab: System Logs ──────────────────────────────────────────────────────────

function SystemLogsTab() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [editTarget, setEditTarget] = useState<LogEntry | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setErr("");
        try {
            const res = await fetch("/api/admin/logs?limit=300");
            const d = await res.json();
            if (!res.ok) throw new Error(d.error ?? "Failed");
            setLogs(d.logs ?? []);
        } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = logs.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.service.toLowerCase().includes(search.toLowerCase()) ||
        l.status.toLowerCase().includes(search.toLowerCase()) ||
        l.user.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div>
            {/* Header bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
                    <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#64748b", pointerEvents: "none" }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search logs, users, actions…"
                        style={{ width: "100%", paddingLeft: 36, padding: "9px 12px 9px 36px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9, color: "#e2e8f0", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
                    />
                </div>
                <span style={{ fontSize: "0.78rem", color: "#475569", marginLeft: "auto" }}>
                    {filtered.length} of {logs.length} logs
                </span>
                <button onClick={load} title="Refresh" style={{ padding: 10, borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#64748b", cursor: "pointer" }}>
                    <RefreshCw size={16} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
                </button>
            </div>

            {err && <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", borderRadius: 9, color: "#ef4444", fontSize: "0.85rem", marginBottom: 16 }}>{err}</div>}

            <div style={CARD}>
                {loading ? (
                    <div style={{ padding: 60, textAlign: "center", color: "#475569" }}>Loading system logs…</div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                                {["Activity", "Service", "User", "Date", "Status", "Actions"].map(h => (
                                    <th key={h} style={{ padding: "11px 18px", textAlign: "left", fontSize: "0.72rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: "48px 20px", textAlign: "center", color: "#475569" }}>No logs found.</td></tr>
                            ) : filtered.map(log => {
                                const sc = statusColor(log.status);
                                const svc = serviceColor(log.service);
                                const isOpen = expanded === log.id;
                                return (
                                    <Fragment key={log.id}>
                                        <tr
                                            onClick={() => setExpanded(isOpen ? null : log.id)}
                                            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", background: isOpen ? "rgba(59,130,246,0.04)" : "transparent", transition: "background 0.1s" }}
                                            onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.02)"; }}
                                            onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                                        >
                                            <td style={{ padding: "13px 18px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${svc}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                        <Activity size={14} color={svc} />
                                                    </div>
                                                    <p style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.875rem" }}>{log.action}</p>
                                                </div>
                                            </td>
                                            <td style={{ padding: "13px 18px" }}>
                                                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: svc }}>{log.service}</span>
                                            </td>
                                            <td style={{ padding: "13px 18px" }}>
                                                <p style={{ fontSize: "0.82rem", color: "#e2e8f0" }}>{log.user.email}</p>
                                                {log.user.name && <p style={{ fontSize: "0.72rem", color: "#475569" }}>{log.user.name}</p>}
                                            </td>
                                            <td style={{ padding: "13px 18px", fontSize: "0.8rem", color: "#64748b", whiteSpace: "nowrap" }}>
                                                {fmt(log.createdAt)}
                                            </td>
                                            <td style={{ padding: "13px 18px" }}>
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20, background: sc.bg, color: sc.color, fontSize: "0.75rem", fontWeight: 700 }}>
                                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.color }} />
                                                    {log.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: "13px 18px" }} onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => setEditTarget(log)}
                                                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, transition: "all 0.15s" }}
                                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#ef4444"; (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; }}
                                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#64748b"; }}
                                                >
                                                    <Edit3 size={12} />
                                                    Edit
                                                </button>
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr key={`${log.id}-detail`}>
                                                <td colSpan={6} style={{ padding: "0 18px 14px", background: "rgba(59,130,246,0.02)" }}>
                                                    <div style={{ padding: 16, background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
                                                        <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Details</p>
                                                        {log.details ? (
                                                            <pre style={{ padding: 12, background: "rgba(0,0,0,0.3)", borderRadius: 8, fontSize: "0.78rem", color: "#94a3b8", overflowX: "auto", fontFamily: "monospace", margin: 0 }}>
                                                                {JSON.stringify(log.details, null, 2)}
                                                            </pre>
                                                        ) : (
                                                            <p style={{ fontSize: "0.82rem", color: "#475569" }}>No additional details.</p>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {editTarget && (
                <EditLogModal
                    log={editTarget}
                    onClose={() => setEditTarget(null)}
                    onSuccess={load}
                />
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"users" | "logs">("users");

    // Client-side role guard (server-side protection via middleware is preferred for production)
    useEffect(() => {
        if (status === "loading") return;
        const role = (session?.user as { role?: string })?.role;
        if (!session || role !== "ADMIN") {
            router.replace("/dashboard");
        }
    }, [session, status, router]);

    if (status === "loading") {
        return (
            <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: "#475569" }}>Verifying access…</p>
            </div>
        );
    }

    const role = (session?.user as { role?: string })?.role;
    if (role !== "ADMIN") return null;

    const TABS = [
        { id: "users" as const, label: "Users & VMs", icon: <Users size={16} /> },
        { id: "logs"  as const, label: "System Logs", icon: <Activity size={16} /> },
    ];

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: "#0d1117" }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: "#475569", marginBottom: 6 }}>
                    Dashboard &nbsp;•&nbsp; Admin Control Panel
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#d97706)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Shield size={20} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: "1.55rem", fontWeight: 800, color: "#f1f5f9" }}>Admin Control Panel</h1>
                        <p style={{ fontSize: "0.78rem", color: "#64748b" }}>Platform-wide management — users, VMs, and audit logs</p>
                    </div>
                    <span style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 20, background: "rgba(245,158,11,0.15)", color: "#f59e0b", fontSize: "0.75rem", fontWeight: 800, border: "1px solid rgba(245,158,11,0.3)" }}>
                        ADMIN
                    </span>
                </div>
            </div>

            {/* Tab Bar */}
            <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.07)", paddingBottom: 0 }}>
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "10px 18px", borderRadius: "10px 10px 0 0",
                            border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: 700,
                            background: activeTab === tab.id ? "rgba(59,130,246,0.12)" : "transparent",
                            color: activeTab === tab.id ? "#60a5fa" : "#64748b",
                            borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent",
                            transition: "all 0.15s",
                        }}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === "users" && <UsersVmsTab />}
            {activeTab === "logs"  && <SystemLogsTab />}
        </div>
    );
}
