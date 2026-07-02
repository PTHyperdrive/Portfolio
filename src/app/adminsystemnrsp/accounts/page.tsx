"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Users, Search, RefreshCw, ChevronDown, ChevronRight, Monitor, ShoppingBag, X, KeyRound, Eye, EyeOff, Trash2, AlertTriangle, Wallet } from "lucide-react";

interface VpsInstance { id: string; vmId: string; node: string; name: string; os: string; status: string; }
interface AdminUser {
    id: string; name: string | null; email: string; role: string;
    credits: number; hasUsedTrial: boolean; canInvite: boolean; createdAt: string;
    _count: { orders: number; vpsInstances: number };
    vpsInstances: VpsInstance[];
}

export default function AdminAccountsPage() {
    const t = useThemeTokens();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [toggling, setToggling] = useState<string | null>(null);
    const [pwModal, setPwModal] = useState<{ userId: string; name: string; email: string } | null>(null);
    const [newPw, setNewPw] = useState("");
    const [pwVisible, setPwVisible] = useState(false);
    const [pwSaving, setPwSaving] = useState(false);
    const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
    // Credit adjustment state (delta only — admins can never SET a balance)
    const [crModal, setCrModal] = useState<{ userId: string; name: string; email: string; credits: number } | null>(null);
    const [crDelta, setCrDelta] = useState("");
    const [crReason, setCrReason] = useState("");
    const [crSaving, setCrSaving] = useState(false);
    const [crMsg, setCrMsg] = useState<{ ok: boolean; text: string } | null>(null);
    // Bulk delete state
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleteModal, setDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteErr, setDeleteErr] = useState("");
    const [countdown, setCountdown] = useState(5);
    const countdownRef = useRef<ReturnType<typeof setInterval>>(null);

    const toggleCanInvite = async (userId: string, current: boolean) => {
        setToggling(userId);
        try {
            const res = await fetch("/api/admin/accounts", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, canInvite: !current }),
            });
            if (res.ok) {
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, canInvite: !current } : u));
            }
        } catch { /* silent */ }
        finally { setToggling(null); }
    };

    const resetPassword = async () => {
        if (!pwModal || newPw.length < 8) { setPwMsg({ ok: false, text: "Password must be at least 8 characters" }); return; }
        setPwSaving(true); setPwMsg(null);
        try {
            const res = await fetch("/api/admin/accounts/password", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: pwModal.userId, newPassword: newPw }),
            });
            if (res.ok) {
                setPwMsg({ ok: true, text: "Password updated successfully" });
                setTimeout(() => { setPwModal(null); setNewPw(""); setPwVisible(false); setPwMsg(null); }, 1500);
            } else {
                const d = await res.json();
                setPwMsg({ ok: false, text: d.error || "Failed to reset password" });
            }
        } catch { setPwMsg({ ok: false, text: "Network error" }); }
        finally { setPwSaving(false); }
    };

    const adjustCredits = async () => {
        const delta = parseInt(crDelta, 10);
        if (!crModal || !Number.isInteger(delta) || delta === 0) {
            setCrMsg({ ok: false, text: "Enter a non-zero amount (use - to remove)" });
            return;
        }
        setCrSaving(true); setCrMsg(null);
        try {
            const res = await fetch("/api/admin/users/credits", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: crModal.userId, delta, reason: crReason }),
            });
            const d = await res.json();
            if (res.ok) {
                setUsers(prev => prev.map(u => u.id === crModal.userId ? { ...u, credits: d.newBalance } : u));
                setCrMsg({ ok: true, text: `New balance: ${d.newBalance.toLocaleString()}` });
                setTimeout(() => { setCrModal(null); setCrDelta(""); setCrReason(""); setCrMsg(null); }, 1200);
            } else {
                setCrMsg({ ok: false, text: d.error || "Adjustment failed" });
            }
        } catch { setCrMsg({ ok: false, text: "Network error" }); }
        finally { setCrSaving(false); }
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/accounts");
            if (res.ok) { const d = await res.json(); setUsers(d.users ?? []); }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.name ?? "").toLowerCase().includes(search.toLowerCase())
    );

    // Selection helpers
    const toggleSelect = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const selectableUsers = filtered.filter(u => u.role !== "ADMIN");
    const allSelected = selectableUsers.length > 0 && selectableUsers.every(u => selected.has(u.id));
    const toggleAll = () => {
        if (allSelected) setSelected(new Set());
        else setSelected(new Set(selectableUsers.map(u => u.id)));
    };

    // Delete modal open
    const openDeleteModal = () => {
        if (selected.size === 0) return;
        setDeleteErr("");
        setCountdown(5);
        setDeleteModal(true);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
                return prev - 1;
            });
        }, 1000);
    };
    const closeDeleteModal = () => {
        setDeleteModal(false);
        if (countdownRef.current) clearInterval(countdownRef.current);
    };

    // Bulk delete handler
    const handleBulkDelete = async () => {
        if (countdown > 0 || deleting) return;
        setDeleting(true); setDeleteErr("");
        try {
            const res = await fetch("/api/admin/accounts", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userIds: Array.from(selected) }),
            });
            const data = await res.json();
            if (!res.ok) { setDeleteErr(data.error || "Delete failed"); return; }
            setUsers(prev => prev.filter(u => !selected.has(u.id)));
            setSelected(new Set());
            closeDeleteModal();
        } catch { setDeleteErr("Network error"); }
        finally { setDeleting(false); }
    };

    const totalVMs = users.reduce((a, u) => a + u._count.vpsInstances, 0);
    const totalOrders = users.reduce((a, u) => a + u._count.orders, 0);
    const adminCount = users.filter(u => u.role === "ADMIN").length;

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const inp: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, color: t.textPrimary, fontSize: "0.84rem", outline: "none", padding: "7px 11px", fontFamily: t.fontFamily };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 4 }}>Admin System &bull; User Accounts</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Users style={{ width: 20, height: 20, color: t.statusWarning }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>User Accounts</h1>
                            <p style={{ fontSize: "0.82rem", color: t.textMuted }}>All registered users and their resources.</p>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        {selected.size > 0 && (
                            <button onClick={openDeleteModal} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.cardRadius, border: `1px solid ${t.statusError}40`, background: `${t.statusError}15`, color: t.statusError, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                                <Trash2 style={{ width: 13, height: 13 }} /> Delete {selected.size} account{selected.size > 1 ? "s" : ""}
                            </button>
                        )}
                        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                            <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
                {[
                    { label: "Total Users", val: users.length, color: t.accentPrimary },
                    { label: "Admins", val: adminCount, color: t.statusWarning },
                    { label: "Total VMs", val: totalVMs, color: t.statusSuccess },
                    { label: "Total Orders", val: totalOrders, color: t.accentSecondary },
                ].map(s => (
                    <div key={s.label} style={{ ...card, padding: "16px 20px" }}>
                        <p style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{s.label}</p>
                        <p style={{ fontSize: "1.6rem", fontWeight: 800, color: s.color }}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Search */}
            <div style={{ position: "relative", marginBottom: 14, maxWidth: 380 }}>
                <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: t.textMuted, pointerEvents: "none" }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ ...inp, width: "100%", paddingLeft: 30, boxSizing: "border-box" as const }} />
                {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t.textMuted, cursor: "pointer", display: "flex" }}><X style={{ width: 11, height: 11 }} /></button>}
            </div>

            {/* Table */}
            <div style={card}>
                {loading ? (
                    <div style={{ padding: "40px", textAlign: "center", color: t.textMuted }}>Loading accounts...</div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: t.bgSecondary }}>
                                <th style={{ padding: "10px 12px", borderBottom: `1px solid ${t.borderSecondary}`, width: 40 }}>
                                    <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: t.accentPrimary, cursor: "pointer", width: 15, height: 15 }} title="Select all non-admin users" />
                                </th>
                                {["User", "Email", "Role", "Credits", "VMs", "Orders", "Allow Invite", "Joined", "", ""].map((h, i) => (
                                    <th key={`${h}-${i}`} style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}`, whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(user => (
                                <Fragment key={user.id}>
                                    <tr
                                        onClick={() => setExpanded(expanded === user.id ? null : user.id)}
                                        style={{ borderBottom: `1px solid ${t.borderSecondary}`, cursor: "pointer", background: selected.has(user.id) ? `${t.accentPrimary}08` : "transparent" }}
                                        onMouseEnter={e => { if (!selected.has(user.id)) e.currentTarget.style.background = t.bgCardHover; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = selected.has(user.id) ? `${t.accentPrimary}08` : "transparent"; }}>
                                        <td style={{ padding: "12px 12px", width: 40 }} onClick={e => e.stopPropagation()}>
                                            {user.role !== "ADMIN" ? (
                                                <input type="checkbox" checked={selected.has(user.id)} onChange={() => toggleSelect(user.id)} style={{ accentColor: t.accentPrimary, cursor: "pointer", width: 15, height: 15 }} />
                                            ) : (
                                                <span style={{ width: 15, height: 15, display: "inline-block" }} />
                                            )}
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <div style={{ width: 30, height: 30, borderRadius: t.cardRadius, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.75rem", color: t.accentPrimary, flexShrink: 0 }}>
                                                    {(user.name || user.email)[0].toUpperCase()}
                                                </div>
                                                <span style={{ fontWeight: 600, fontSize: "0.875rem", color: t.textPrimary }}>{user.name || "—"}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: "12px 16px", fontSize: "0.82rem", color: t.textMuted }}>{user.email}</td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.68rem", fontWeight: 700, background: user.role === "ADMIN" ? t.statusWarningBg : t.accentPrimaryMuted, color: user.role === "ADMIN" ? t.statusWarning : t.accentPrimary }}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <button
                                                onClick={e => { e.stopPropagation(); setCrModal({ userId: user.id, name: user.name || user.email, email: user.email, credits: user.credits }); }}
                                                title="Adjust credits"
                                                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", cursor: "pointer", fontFamily: t.fontMono, fontSize: "0.82rem", color: t.statusSuccess }}
                                            >
                                                {user.credits.toLocaleString()}
                                                <Wallet style={{ width: 12, height: 12, color: t.textMuted }} />
                                            </button>
                                        </td>
                                        <td style={{ padding: "12px 16px", fontFamily: t.fontMono, fontSize: "0.875rem", fontWeight: 600, color: t.textSecondary }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                <Monitor style={{ width: 11, height: 11, color: t.textMuted }} /> {user._count.vpsInstances}
                                            </div>
                                        </td>
                                        <td style={{ padding: "12px 16px", fontFamily: t.fontMono, fontSize: "0.875rem", fontWeight: 600, color: t.textSecondary }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                <ShoppingBag style={{ width: 11, height: 11, color: t.textMuted }} /> {user._count.orders}
                                            </div>
                                        </td>
                                        <td style={{ padding: "12px 16px", fontSize: "0.75rem", color: t.textMuted }}>{new Date(user.createdAt).toLocaleDateString()}</td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleCanInvite(user.id, user.canInvite); }}
                                                disabled={toggling === user.id}
                                                style={{
                                                    width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                                                    background: user.canInvite ? t.statusSuccess : `${t.textMuted}40`,
                                                    position: "relative", transition: "background 0.2s",
                                                    opacity: toggling === user.id ? 0.5 : 1,
                                                }}
                                                title={user.canInvite ? "Disable invitations" : "Enable invitations"}
                                            >
                                                <span style={{
                                                    position: "absolute", top: 2, left: user.canInvite ? 18 : 2,
                                                    width: 16, height: 16, borderRadius: "50%",
                                                    background: "#fff", transition: "left 0.2s",
                                                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                                                }} />
                                            </button>
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setPwModal({ userId: user.id, name: user.name || "—", email: user.email }); setNewPw(""); setPwVisible(false); setPwMsg(null); }}
                                                title="Reset password"
                                                style={{
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    width: 28, height: 28, borderRadius: t.buttonRadius,
                                                    border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                                    color: t.textMuted, cursor: "pointer", transition: "all 0.15s",
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = t.accentPrimaryMuted; e.currentTarget.style.color = t.accentPrimary; e.currentTarget.style.borderColor = t.accentPrimary; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = t.textMuted; e.currentTarget.style.borderColor = t.borderPrimary; }}
                                            >
                                                <KeyRound style={{ width: 13, height: 13 }} />
                                            </button>
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            {expanded === user.id
                                                ? <ChevronDown style={{ width: 14, height: 14, color: t.textMuted }} />
                                                : <ChevronRight style={{ width: 14, height: 14, color: t.textMuted }} />}
                                        </td>
                                    </tr>

                                    {/* Expanded VMs */}
                                    {expanded === user.id && user.vpsInstances.length > 0 && (
                                        <tr key={`${user.id}-exp`}>
                                            <td colSpan={11} style={{ padding: "0 16px 14px", background: t.bgSecondary }}>
                                                <div style={{ padding: "12px 14px", borderRadius: t.cardRadius, background: t.bgTertiary, border: `1px solid ${t.borderSecondary}` }}>
                                                    <p style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>VPS Instances</p>
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                                        {user.vpsInstances.map(vm => (
                                                            <div key={vm.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: t.buttonRadius, background: t.bgCard }}>
                                                                <span style={{ width: 7, height: 7, borderRadius: "50%", background: vm.status === "running" ? t.statusSuccess : t.statusError, flexShrink: 0 }} />
                                                                <span style={{ fontWeight: 600, fontSize: "0.82rem", color: t.textPrimary, minWidth: 140 }}>{vm.name}</span>
                                                                <span style={{ fontFamily: t.fontMono, fontSize: "0.72rem", color: t.textMuted }}>VM {vm.vmId}</span>
                                                                <span style={{ fontSize: "0.72rem", color: t.textMuted }}>{vm.node}</span>
                                                                <span style={{ marginLeft: "auto", padding: "1px 7px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 700, background: vm.status === "running" ? t.statusSuccessBg : t.statusErrorBg, color: vm.status === "running" ? t.statusSuccess : t.statusError }}>{vm.status}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                    </div>
                )}
                {!loading && filtered.length === 0 && (
                    <p style={{ padding: "40px", textAlign: "center", color: t.textMuted }}>No users found.</p>
                )}
            </div>

            {/* Credit Adjustment Modal */}
            {crModal && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={() => setCrModal(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ ...card, padding: "28px 32px", maxWidth: 420, width: "90%", position: "relative" }}>
                        <button onClick={() => setCrModal(null)} style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", color: t.textMuted, cursor: "pointer", display: "flex" }}>
                            <X style={{ width: 16, height: 16 }} />
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: t.statusSuccessBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Wallet style={{ width: 18, height: 18, color: t.statusSuccess }} />
                            </div>
                            <div>
                                <p style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary }}>Adjust Credits</p>
                                <p style={{ fontSize: "0.75rem", color: t.textMuted }}>{crModal.name} &bull; balance {crModal.credits.toLocaleString()}</p>
                            </div>
                        </div>
                        <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Amount (+ add / − remove)</label>
                        <input
                            type="number"
                            value={crDelta}
                            onChange={e => setCrDelta(e.target.value)}
                            placeholder="e.g. 50000 or -20000"
                            autoFocus
                            style={{ ...inp, width: "100%", boxSizing: "border-box" as const, marginBottom: 10, fontFamily: t.fontMono }}
                        />
                        <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Reason (optional)</label>
                        <input
                            value={crReason}
                            onChange={e => setCrReason(e.target.value)}
                            placeholder="e.g. Refund for outage"
                            style={{ ...inp, width: "100%", boxSizing: "border-box" as const, marginBottom: 6 }}
                        />
                        {crMsg && (
                            <p style={{ fontSize: "0.75rem", color: crMsg.ok ? t.statusSuccess : t.statusError, marginBottom: 8, fontWeight: 600 }}>{crMsg.text}</p>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                            <button onClick={() => setCrModal(null)} style={{ padding: "7px 16px", borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>Cancel</button>
                            <button
                                onClick={adjustCredits}
                                disabled={crSaving || !crDelta}
                                style={{ padding: "7px 16px", borderRadius: t.cardRadius, border: "none", background: crDelta ? t.accentPrimary : `${t.textMuted}40`, color: "#fff", fontSize: "0.8rem", fontWeight: 600, cursor: crDelta ? "pointer" : "not-allowed" }}
                            >
                                {crSaving ? "Applying..." : "Apply"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Password Reset Modal */}
            {pwModal && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={() => setPwModal(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ ...card, padding: "28px 32px", maxWidth: 420, width: "90%", position: "relative" }}>
                        <button onClick={() => setPwModal(null)} style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", color: t.textMuted, cursor: "pointer", display: "flex" }}>
                            <X style={{ width: 16, height: 16 }} />
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <KeyRound style={{ width: 18, height: 18, color: t.statusWarning }} />
                            </div>
                            <div>
                                <p style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary }}>Reset Password</p>
                                <p style={{ fontSize: "0.75rem", color: t.textMuted }}>{pwModal.name} &bull; {pwModal.email}</p>
                            </div>
                        </div>
                        <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>New Password</label>
                        <div style={{ position: "relative", marginBottom: 6 }}>
                            <input
                                type={pwVisible ? "text" : "password"}
                                value={newPw}
                                onChange={e => setNewPw(e.target.value)}
                                placeholder="Enter new password (min 8 chars)"
                                autoFocus
                                style={{ ...inp, width: "100%", paddingRight: 38, boxSizing: "border-box" as const }}
                            />
                            <button onClick={() => setPwVisible(!pwVisible)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t.textMuted, cursor: "pointer", display: "flex" }}>
                                {pwVisible ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                            </button>
                        </div>
                        {newPw.length > 0 && newPw.length < 8 && (
                            <p style={{ fontSize: "0.7rem", color: t.statusError, marginBottom: 6 }}>Password must be at least 8 characters</p>
                        )}
                        {pwMsg && (
                            <p style={{ fontSize: "0.75rem", color: pwMsg.ok ? t.statusSuccess : t.statusError, marginBottom: 8, fontWeight: 600 }}>{pwMsg.text}</p>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                            <button onClick={() => setPwModal(null)} style={{ padding: "7px 16px", borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>Cancel</button>
                            <button
                                onClick={resetPassword}
                                disabled={pwSaving || newPw.length < 8}
                                style={{
                                    padding: "7px 16px", borderRadius: t.cardRadius, border: "none",
                                    background: newPw.length >= 8 ? t.accentPrimary : `${t.textMuted}40`,
                                    color: "#fff", fontSize: "0.8rem", fontWeight: 600, cursor: newPw.length >= 8 ? "pointer" : "not-allowed",
                                    opacity: pwSaving ? 0.6 : 1, transition: "all 0.15s",
                                }}
                            >
                                {pwSaving ? "Resetting…" : "Reset Password"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Delete Confirmation Modal */}
            {deleteModal && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={closeDeleteModal}>
                    <div onClick={e => e.stopPropagation()} style={{ ...card, padding: "28px 32px", maxWidth: 480, width: "90%", position: "relative" }}>
                        <button onClick={closeDeleteModal} style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", color: t.textMuted, cursor: "pointer", display: "flex" }}><X style={{ width: 16, height: 16 }} /></button>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 10, background: t.statusErrorBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <AlertTriangle style={{ width: 22, height: 22, color: t.statusError }} />
                            </div>
                            <div>
                                <p style={{ fontSize: "1.1rem", fontWeight: 800, color: t.textPrimary }}>Delete {selected.size} Account{selected.size > 1 ? "s" : ""}?</p>
                                <p style={{ fontSize: "0.78rem", color: t.statusError, fontWeight: 600 }}>This action is permanent and cannot be undone.</p>
                            </div>
                        </div>
                        <div style={{ maxHeight: 180, overflowY: "auto", marginBottom: 16, padding: "10px 12px", borderRadius: t.cardRadius, background: t.bgSecondary, border: `1px solid ${t.borderSecondary}` }}>
                            {users.filter(u => selected.has(u.id)).map(u => (
                                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: "0.82rem" }}>
                                    <Trash2 style={{ width: 11, height: 11, color: t.statusError, flexShrink: 0 }} />
                                    <span style={{ color: t.textPrimary, fontWeight: 600 }}>{u.name || "—"}</span>
                                    <span style={{ color: t.textMuted }}>({u.email})</span>
                                </div>
                            ))}
                        </div>
                        <p style={{ fontSize: "0.78rem", color: t.textMuted, lineHeight: 1.5, marginBottom: 16 }}>All user data including VPS instances, orders, sessions, VPCs, WireGuard peers, and chat history will be permanently deleted.</p>
                        {deleteErr && <p style={{ fontSize: "0.78rem", color: t.statusError, fontWeight: 600, marginBottom: 10 }}>{deleteErr}</p>}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button onClick={closeDeleteModal} style={{ padding: "9px 20px", borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.82rem", cursor: "pointer" }}>Cancel</button>
                            <button
                                onClick={handleBulkDelete}
                                disabled={countdown > 0 || deleting}
                                style={{
                                    padding: "9px 20px", borderRadius: t.cardRadius, border: "none",
                                    background: countdown > 0 ? `${t.textMuted}40` : t.statusError,
                                    color: "#fff", fontSize: "0.82rem", fontWeight: 700,
                                    cursor: countdown > 0 || deleting ? "not-allowed" : "pointer",
                                    opacity: deleting ? 0.6 : 1, transition: "all 0.2s",
                                    minWidth: 160,
                                }}
                            >
                                {deleting ? "Deleting…" : countdown > 0 ? `Confirm Delete (${countdown}s)` : `Delete ${selected.size} Account${selected.size > 1 ? "s" : ""}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
