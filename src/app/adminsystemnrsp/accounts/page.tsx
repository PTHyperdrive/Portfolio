"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Users, Search, RefreshCw, ChevronDown, ChevronRight, Monitor, ShoppingBag, X } from "lucide-react";

interface VpsInstance { id: string; vmId: string; node: string; name: string; os: string; status: string; }
interface AdminUser {
    id: string; name: string | null; email: string; role: string;
    credits: number; createdAt: string;
    _count: { orders: number; vpsInstances: number };
    vpsInstances: VpsInstance[];
}

export default function AdminAccountsPage() {
    const t = useThemeTokens();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);

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

    const totalVMs = users.reduce((a, u) => a + u._count.vpsInstances, 0);
    const totalOrders = users.reduce((a, u) => a + u._count.orders, 0);
    const adminCount = users.filter(u => u.role === "ADMIN").length;

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const inp: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.isMono ? 4 : 8, color: t.textPrimary, fontSize: "0.84rem", outline: "none", padding: "7px 11px", fontFamily: t.fontFamily };

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
                    <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                        <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
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
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: t.bgSecondary }}>
                                {["User", "Email", "Role", "Credits", "VMs", "Orders", "Joined", ""].map(h => (
                                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}`, whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(user => (
                                <>
                                    <tr key={user.id}
                                        onClick={() => setExpanded(expanded === user.id ? null : user.id)}
                                        style={{ borderBottom: `1px solid ${t.borderSecondary}`, cursor: "pointer" }}
                                        onMouseEnter={e => (e.currentTarget.style.background = t.bgCardHover)}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                        <td style={{ padding: "12px 16px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <div style={{ width: 30, height: 30, borderRadius: t.isMono ? 4 : 8, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.75rem", color: t.accentPrimary, flexShrink: 0 }}>
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
                                        <td style={{ padding: "12px 16px", fontFamily: t.fontMono, fontSize: "0.82rem", color: t.statusSuccess }}>{user.credits.toLocaleString()}</td>
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
                                            {expanded === user.id
                                                ? <ChevronDown style={{ width: 14, height: 14, color: t.textMuted }} />
                                                : <ChevronRight style={{ width: 14, height: 14, color: t.textMuted }} />}
                                        </td>
                                    </tr>

                                    {/* Expanded VMs */}
                                    {expanded === user.id && user.vpsInstances.length > 0 && (
                                        <tr key={`${user.id}-exp`}>
                                            <td colSpan={8} style={{ padding: "0 16px 14px", background: t.bgSecondary }}>
                                                <div style={{ padding: "12px 14px", borderRadius: t.isMono ? 4 : 8, background: t.bgTertiary, border: `1px solid ${t.borderSecondary}` }}>
                                                    <p style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>VPS Instances</p>
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                                        {user.vpsInstances.map(vm => (
                                                            <div key={vm.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: t.isMono ? 4 : 6, background: t.bgCard }}>
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
                                </>
                            ))}
                        </tbody>
                    </table>
                )}
                {!loading && filtered.length === 0 && (
                    <p style={{ padding: "40px", textAlign: "center", color: t.textMuted }}>No users found.</p>
                )}
            </div>
        </div>
    );
}
