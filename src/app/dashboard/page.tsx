"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface DashboardStats {
    vps: { total: number; active: number; instances: any[] };
    services: { vpn: number; proxy: number; email: number };
    spending: { total: string; monthly: string; daily: string; hourlyRate: string };
    orders: { id: string; serviceName: string; serviceType: string; status: string; totalPrice: string; createdAt: string }[];
}

type TimeRange = "hourly" | "daily" | "monthly";

export default function DashboardPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<TimeRange>("monthly");

    useEffect(() => {
        if (authStatus === "unauthenticated") {
            router.push("/auth/login");
        }
    }, [authStatus, router]);

    useEffect(() => {
        if (authStatus !== "authenticated") return;
        fetch("/api/dashboard/stats")
            .then((r) => r.json())
            .then((data) => setStats(data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [authStatus]);

    if (authStatus === "loading" || loading) {
        return (
            <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "100px" }}>
                <div style={{ textAlign: "center" }}>
                    <div className="animate-glow" style={{ width: 48, height: 48, borderRadius: "12px", background: "var(--gradient-primary)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>📊</div>
                    <p style={{ color: "var(--text-muted)" }}>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (!session) return null;

    const spendingDisplay = timeRange === "hourly"
        ? stats?.spending.hourlyRate || "0.00"
        : timeRange === "daily"
            ? stats?.spending.daily || "0.00"
            : stats?.spending.monthly || "0.00";

    const spendingLabel = timeRange === "hourly" ? "per hour" : timeRange === "daily" ? "today" : "this month";

    return (
        <div style={{ paddingTop: "100px", paddingBottom: "60px", minHeight: "100vh" }}>
            <div className="container">
                {/* Header */}
                <div style={{ marginBottom: "40px" }}>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                        Welcome back, <span className="gradient-text">{session.user?.name || session.user?.email?.split("@")[0]}</span>
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                        Here&apos;s an overview of your services and usage.
                    </p>
                </div>

                {/* Service Summary Cards */}
                <div className="grid-4 stagger" style={{ marginBottom: "40px" }}>
                    <Link href="/dashboard/vps" className="glass-card" style={{ padding: "24px", textDecoration: "none", display: "block" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                            <div style={{ fontSize: "1.5rem" }}>🖥️</div>
                            <span style={{ color: "var(--accent-cyan)", fontSize: "0.75rem", fontWeight: 600 }}>→</span>
                        </div>
                        <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-cyan)", marginBottom: "4px" }}>
                            {stats?.vps.active || 0}<span style={{ fontSize: "1rem", color: "var(--text-muted)", fontWeight: 400 }}>/{stats?.vps.total || 0}</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "2px" }}>Active VPS</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Instances running</div>
                    </Link>

                    <Link href="/dashboard/vpn" className="glass-card" style={{ padding: "24px", textDecoration: "none", display: "block" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                            <div style={{ fontSize: "1.5rem" }}>🔒</div>
                            <span style={{ color: "var(--accent-green)", fontSize: "0.75rem", fontWeight: 600 }}>→</span>
                        </div>
                        <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-green)", marginBottom: "4px" }}>{stats?.services.vpn || 0}</div>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "2px" }}>VPN Configs</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Active configurations</div>
                    </Link>

                    <Link href="/dashboard/proxy" className="glass-card" style={{ padding: "24px", textDecoration: "none", display: "block" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                            <div style={{ fontSize: "1.5rem" }}>🌐</div>
                            <span style={{ color: "var(--accent-magenta)", fontSize: "0.75rem", fontWeight: 600 }}>→</span>
                        </div>
                        <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-magenta)", marginBottom: "4px" }}>{stats?.services.proxy || 0}</div>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "2px" }}>Proxy Accounts</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Active proxies</div>
                    </Link>

                    <div className="glass-card" style={{ padding: "24px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                            <div style={{ fontSize: "1.5rem" }}>📧</div>
                        </div>
                        <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-purple)", marginBottom: "4px" }}>{stats?.services.email || 0}</div>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "2px" }}>Email Accounts</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Active mailboxes</div>
                    </div>
                </div>

                {/* Spending & Usage Section */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "40px" }}>
                    {/* Spending Card */}
                    <div className="glass-card" style={{ padding: "28px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                            <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>💰 Spending</h2>
                            <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.04)", borderRadius: "8px", padding: "3px" }}>
                                {(["hourly", "daily", "monthly"] as TimeRange[]).map((range) => (
                                    <button
                                        key={range}
                                        onClick={() => setTimeRange(range)}
                                        style={{
                                            padding: "6px 12px",
                                            borderRadius: "6px",
                                            fontSize: "0.75rem",
                                            fontWeight: 600,
                                            border: "none",
                                            cursor: "pointer",
                                            background: timeRange === range ? "var(--accent-cyan)" : "transparent",
                                            color: timeRange === range ? "#000" : "var(--text-muted)",
                                            transition: "all 0.2s",
                                            textTransform: "capitalize",
                                        }}
                                    >
                                        {range}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div style={{ fontSize: "2.5rem", fontWeight: 800, marginBottom: "4px" }}>
                            <span className="gradient-text">${spendingDisplay}</span>
                        </div>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{spendingLabel}</p>
                        <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "8px" }}>
                                <span style={{ color: "var(--text-muted)" }}>Total all-time</span>
                                <span style={{ fontWeight: 600 }}>${stats?.spending.total || "0.00"}</span>
                            </div>
                        </div>
                    </div>

                    {/* VM Usage Card */}
                    <div className="glass-card" style={{ padding: "28px" }}>
                        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "20px" }}>⏱ VM Usage</h2>
                        {stats?.vps.instances && stats.vps.instances.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {stats.vps.instances.map((vm: any) => (
                                    <div key={vm.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: "8px", background: "rgba(255,255,255,0.03)" }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{vm.name}</div>
                                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{vm.os}</div>
                                        </div>
                                        <span className="badge" style={{
                                            background: vm.status === "running" ? "rgba(0,255,136,0.1)" : "rgba(255,0,110,0.1)",
                                            color: vm.status === "running" ? "var(--accent-green)" : "var(--accent-magenta)",
                                            textTransform: "capitalize",
                                        }}>
                                            {vm.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: "center", padding: "30px 0" }}>
                                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🖥️</div>
                                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No VPS instances yet</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Plan Management */}
                <div style={{ marginBottom: "40px" }}>
                    <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "16px" }}>📦 Plan Management</h2>
                    {stats?.orders && stats.orders.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {stats.orders.map((order) => (
                                <div key={order.id} className="glass-card" style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                        <div style={{
                                            width: 40, height: 40, borderRadius: "10px",
                                            background: order.serviceType === "VPS" ? "rgba(0,240,255,0.1)" : "rgba(160,100,255,0.1)",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            fontSize: "1.1rem",
                                        }}>
                                            {order.serviceType === "VPS" ? "🖥️" : order.serviceType === "VPN" ? "🔒" : order.serviceType === "PROXY" ? "🌐" : "📧"}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{order.serviceName}</div>
                                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                                ${order.totalPrice} • {new Date(order.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                        <span className="badge" style={{
                                            background: order.status === "ACTIVE" ? "rgba(0,255,136,0.1)" : "rgba(255,200,0,0.1)",
                                            color: order.status === "ACTIVE" ? "var(--accent-green)" : "var(--accent-orange)",
                                            textTransform: "capitalize",
                                        }}>
                                            {order.status.toLowerCase()}
                                        </span>
                                        {order.status === "ACTIVE" && (
                                            <button className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: "0.78rem" }}>
                                                ⬆ Upgrade
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
                            <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📦</div>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "16px" }}>
                                No active plans. Browse our services to get started.
                            </p>
                            <Link href="/services/vps" className="btn btn-secondary" style={{ marginTop: "8px" }}>
                                Explore Services
                            </Link>
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div>
                    <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "16px" }}>⚡ Quick Actions</h2>
                    <div className="grid-4" style={{ gap: "12px" }}>
                        {[
                            { label: "Generate VPN Config", href: "/dashboard/vpn", icon: "🔒" },
                            { label: "Buy Proxy Accounts", href: "/services/proxy", icon: "🛒" },
                            { label: "Deploy New VPS", href: "/services/vps", icon: "🚀" },
                            { label: "View All Orders", href: "/dashboard/orders", icon: "📋" },
                        ].map((action) => (
                            <Link
                                key={action.label}
                                href={action.href}
                                className="glass-card"
                                style={{ padding: "16px 20px", textDecoration: "none", display: "flex", alignItems: "center", gap: "12px" }}
                            >
                                <span style={{ fontSize: "1.2rem" }}>{action.icon}</span>
                                <span style={{ fontSize: "0.88rem", fontWeight: 500 }}>{action.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
