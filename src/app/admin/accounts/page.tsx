"use client";

import { useState, useEffect, useCallback } from "react";

interface UserAccount {
    id: string;
    name: string | null;
    email: string;
    role: string;
    balance: number;
    createdAt: string;
    _count: {
        orders: number;
        vpsInstances: number;
    };
    vpsInstances: {
        id: string;
        vmId: string;
        node: string;
        name: string;
        os: string;
        status: string;
        specs: Record<string, unknown> | null;
    }[];
}

export default function AdminAccountsPage() {
    const [users, setUsers] = useState<UserAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedUser, setExpandedUser] = useState<string | null>(null);

    const loadUsers = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/accounts");
            if (!res.ok) throw new Error("Failed to load accounts");
            const data = await res.json();
            setUsers(data.users || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadUsers(); }, [loadUsers]);

    const filteredUsers = users.filter((u) => {
        const q = searchQuery.toLowerCase();
        return (u.name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    });

    const totalVMs = users.reduce((a, u) => a + u._count.vpsInstances, 0);
    const totalOrders = users.reduce((a, u) => a + u._count.orders, 0);
    const activeVMs = users.reduce((a, u) => a + u.vpsInstances.filter(v => v.status === "running").length, 0);

    if (loading) {
        return (
            <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "100px" }}>
                <p style={{ color: "var(--text-muted)" }}>Loading accounts...</p>
            </div>
        );
    }

    return (
        <div style={{ paddingTop: "120px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container">
                <div style={{ marginBottom: "40px" }}>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                        👥 Account <span className="gradient-text">Management</span>
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                        Overview of all user accounts and their VPS instances.
                    </p>
                </div>

                {error && (
                    <div style={{ padding: "14px 20px", borderRadius: "var(--radius-sm)", background: "rgba(255,0,110,0.1)", border: "1px solid rgba(255,0,110,0.2)", color: "var(--accent-magenta)", marginBottom: "20px", fontSize: "0.9rem" }}>
                        {error}
                    </div>
                )}

                {/* Stats Overview */}
                <div className="grid-4" style={{ marginBottom: "28px" }}>
                    {[
                        { label: "Total Users", value: users.length, icon: "👥", color: "var(--accent-cyan)" },
                        { label: "Total VMs", value: totalVMs, icon: "🖥", color: "var(--accent-purple)" },
                        { label: "Active VMs", value: activeVMs, icon: "🟢", color: "var(--accent-green)" },
                        { label: "Total Orders", value: totalOrders, icon: "📦", color: "var(--accent-magenta)" },
                    ].map((stat) => (
                        <div key={stat.label} className="glass-card" style={{ padding: "20px", textAlign: "center" }}>
                            <div style={{ fontSize: "1.5rem", marginBottom: "8px" }}>{stat.icon}</div>
                            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: stat.color }} className="mono">{stat.value}</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>{stat.label}</div>
                        </div>
                    ))}
                </div>

                {/* Search */}
                <div style={{ marginBottom: "20px" }}>
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input-field"
                        style={{ maxWidth: "400px", padding: "10px 16px" }}
                    />
                </div>

                {/* Users Table */}
                <div className="glass-card" style={{ padding: "0", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                                {["User", "Email", "Role", "Balance", "VMs", "Orders", "Joined", ""].map((h) => (
                                    <th key={h} style={{ padding: "14px 16px", textAlign: "left", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--glass-border)" }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((user) => (
                                <>
                                    <tr key={user.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: "pointer" }} onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}>
                                        <td style={{ padding: "14px 16px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                <div style={{
                                                    width: 34, height: 34, borderRadius: "10px",
                                                    background: "var(--gradient-primary)",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    fontWeight: 700, fontSize: "0.8rem", color: "var(--text-inverse)",
                                                }}>
                                                    {(user.name || user.email)[0].toUpperCase()}
                                                </div>
                                                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{user.name || "—"}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: "14px 16px", fontSize: "0.85rem", color: "var(--text-muted)" }}>{user.email}</td>
                                        <td style={{ padding: "14px 16px" }}>
                                            <span className="badge" style={{
                                                background: user.role === "ADMIN" ? "rgba(255,0,110,0.15)" : "rgba(0,240,255,0.1)",
                                                color: user.role === "ADMIN" ? "var(--accent-magenta)" : "var(--accent-cyan)",
                                                fontSize: "0.72rem",
                                            }}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td style={{ padding: "14px 16px" }} className="mono">
                                            <span style={{ color: "var(--accent-green)", fontSize: "0.88rem", fontWeight: 600 }}>
                                                ${Number(user.balance).toFixed(2)}
                                            </span>
                                        </td>
                                        <td style={{ padding: "14px 16px", fontSize: "0.9rem", fontWeight: 600 }} className="mono">{user._count.vpsInstances}</td>
                                        <td style={{ padding: "14px 16px", fontSize: "0.9rem" }} className="mono">{user._count.orders}</td>
                                        <td style={{ padding: "14px 16px", fontSize: "0.82rem", color: "var(--text-muted)" }}>{new Date(user.createdAt).toLocaleDateString()}</td>
                                        <td style={{ padding: "14px 16px", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                                            {expandedUser === user.id ? "▼" : "▶"}
                                        </td>
                                    </tr>

                                    {/* Expanded VM Details */}
                                    {expandedUser === user.id && user.vpsInstances.length > 0 && (
                                        <tr key={`${user.id}-detail`}>
                                            <td colSpan={8} style={{ padding: "0 16px 16px", background: "rgba(0,0,0,0.15)" }}>
                                                <div style={{ padding: "16px", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.02)" }}>
                                                    <h4 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                                        VPS Instances
                                                    </h4>
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                                        {user.vpsInstances.map((vm) => (
                                                            <div key={vm.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", borderRadius: "6px", background: "rgba(255,255,255,0.02)" }}>
                                                                <div style={{
                                                                    width: 8, height: 8, borderRadius: "50%",
                                                                    background: vm.status === "running" ? "var(--accent-green)" : "var(--accent-magenta)",
                                                                }} />
                                                                <span style={{ fontWeight: 600, fontSize: "0.85rem", minWidth: "120px" }}>{vm.name}</span>
                                                                <span className="mono" style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>VM {vm.vmId}</span>
                                                                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{vm.node}</span>
                                                                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{vm.os}</span>
                                                                <span className="badge" style={{
                                                                    background: vm.status === "running" ? "rgba(0,255,136,0.1)" : "rgba(255,0,110,0.1)",
                                                                    color: vm.status === "running" ? "var(--accent-green)" : "var(--accent-magenta)",
                                                                    fontSize: "0.7rem", marginLeft: "auto",
                                                                }}>
                                                                    {vm.status}
                                                                </span>
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
                    {filteredUsers.length === 0 && (
                        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>No users found.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
