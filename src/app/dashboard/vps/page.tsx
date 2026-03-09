"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface VpsInstance {
    id: string;
    vmId: string;
    node: string;
    name: string;
    os: string;
    status: string;
    specs: { vcpu?: number; ram_gb?: number; disk_gb?: number; gpu?: string } | null;
    ipAddress: string | null;
    expiresAt: string | null;
    liveData?: {
        status: string;
        uptime: number;
        cpu: number;
        memory: number;
        maxmem: number;
    };
}

export default function VpsDashboard() {
    const [instances, setInstances] = useState<VpsInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState("");

    const loadInstances = useCallback(async () => {
        try {
            const res = await fetch("/api/proxmox/vms");
            if (!res.ok) throw new Error("Failed to load VMs");
            const data = await res.json();
            setInstances(data.instances || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadInstances();
        const interval = setInterval(loadInstances, 15000);
        return () => clearInterval(interval);
    }, [loadInstances]);

    const handleAction = async (vmId: string, node: string, action: string) => {
        setActionLoading(`${vmId}-${action}`);
        try {
            const res = await fetch(`/api/proxmox/vms/${vmId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, node }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Action failed");
            }
            // Refresh after action
            setTimeout(loadInstances, 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed");
        } finally {
            setActionLoading(null);
        }
    };

    const formatUptime = (seconds: number) => {
        if (!seconds) return "—";
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const formatBytes = (bytes: number) => {
        if (!bytes) return "—";
        const gb = bytes / (1024 * 1024 * 1024);
        return `${gb.toFixed(1)} GB`;
    };

    const statusColor = (status: string) => {
        switch (status) {
            case "running": return "var(--accent-green)";
            case "stopped": return "var(--accent-magenta)";
            case "paused": return "var(--accent-orange)";
            default: return "var(--text-muted)";
        }
    };

    if (loading) {
        return (
            <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                    <div className="animate-glow" style={{ width: 48, height: 48, borderRadius: "12px", background: "var(--gradient-primary)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>⚡</div>
                    <p style={{ color: "var(--text-muted)" }}>Loading your VPS instances...</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ paddingTop: "120px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container">
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                            VPS <span className="gradient-text">Instances</span>
                        </h1>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                            Manage your virtual private servers
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <button onClick={loadInstances} className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: "0.85rem" }}>
                            🔄 Refresh
                        </button>
                        <span className="badge badge-cyan">
                            {instances.length} Instance{instances.length !== 1 ? "s" : ""}
                        </span>
                    </div>
                </div>

                {error && (
                    <div style={{ padding: "14px 20px", borderRadius: "var(--radius-sm)", background: "rgba(255,0,110,0.1)", border: "1px solid rgba(255,0,110,0.2)", color: "var(--accent-magenta)", marginBottom: "24px", fontSize: "0.9rem" }}>
                        {error}
                        <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
                    </div>
                )}

                {instances.length === 0 ? (
                    <div className="glass-card" style={{ padding: "80px 40px", textAlign: "center" }}>
                        <div style={{ fontSize: "3rem", marginBottom: "16px" }}>🖥️</div>
                        <h3 style={{ fontSize: "1.3rem", marginBottom: "8px" }}>No VPS Instances</h3>
                        <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>
                            You don&apos;t have any VPS instances yet. Purchase a plan to get started.
                        </p>
                        <Link href="/services/vps" className="btn btn-primary">
                            Browse VPS Plans
                        </Link>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {instances.map((vm) => {
                            const live = vm.liveData;
                            const isRunning = (live?.status || vm.status) === "running";
                            const cpuPercent = live?.cpu ? (live.cpu * 100).toFixed(1) : "0";
                            const memUsed = live?.memory || 0;
                            const memTotal = live?.maxmem || 0;
                            const memPercent = memTotal > 0 ? ((memUsed / memTotal) * 100).toFixed(0) : "0";

                            return (
                                <div key={vm.id} className="glass-card" style={{ padding: "0", overflow: "hidden" }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "20px", padding: "24px 28px", alignItems: "center" }}>
                                        {/* VM Info */}
                                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: "24px", alignItems: "center" }}>
                                            {/* Status Dot & Name */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                                                <div style={{
                                                    width: 12, height: 12, borderRadius: "50%",
                                                    background: statusColor(live?.status || vm.status),
                                                    boxShadow: isRunning ? `0 0 12px ${statusColor("running")}` : "none",
                                                    animation: isRunning ? "glowPulse 2s ease-in-out infinite" : "none",
                                                }} />
                                                <div>
                                                    <Link
                                                        href={`/dashboard/vps/${vm.vmId}?node=${vm.node}`}
                                                        style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", textDecoration: "none" }}
                                                    >
                                                        {vm.name}
                                                    </Link>
                                                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                                                        <span className="mono" style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>VM {vm.vmId}</span>
                                                        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>•</span>
                                                        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{vm.node}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Specs */}
                                            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                                                {vm.specs?.vcpu && (
                                                    <div style={{ fontSize: "0.82rem" }}>
                                                        <span style={{ color: "var(--text-muted)" }}>CPU </span>
                                                        <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{vm.specs.vcpu} vCPU</span>
                                                    </div>
                                                )}
                                                {vm.specs?.ram_gb && (
                                                    <div style={{ fontSize: "0.82rem" }}>
                                                        <span style={{ color: "var(--text-muted)" }}>RAM </span>
                                                        <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{vm.specs.ram_gb} GB</span>
                                                    </div>
                                                )}
                                                {vm.ipAddress && (
                                                    <div style={{ fontSize: "0.82rem" }}>
                                                        <span style={{ color: "var(--text-muted)" }}>IP </span>
                                                        <span className="mono" style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>{vm.ipAddress}</span>
                                                    </div>
                                                )}
                                                <div style={{ fontSize: "0.82rem" }}>
                                                    <span style={{ color: "var(--text-muted)" }}>OS </span>
                                                    <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{vm.os}</span>
                                                </div>
                                            </div>

                                            {/* Live Stats */}
                                            {isRunning && live && (
                                                <div style={{ display: "flex", gap: "16px" }}>
                                                    {/* CPU Bar */}
                                                    <div style={{ width: "100px" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                                                            <span>CPU</span>
                                                            <span className="mono">{cpuPercent}%</span>
                                                        </div>
                                                        <div style={{ height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.06)" }}>
                                                            <div style={{ height: "100%", borderRadius: "2px", background: "var(--accent-cyan)", width: `${Math.min(100, parseFloat(cpuPercent))}%`, transition: "width 0.3s" }} />
                                                        </div>
                                                    </div>
                                                    {/* RAM Bar */}
                                                    <div style={{ width: "100px" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                                                            <span>RAM</span>
                                                            <span className="mono">{formatBytes(memUsed)}</span>
                                                        </div>
                                                        <div style={{ height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.06)" }}>
                                                            <div style={{ height: "100%", borderRadius: "2px", background: "var(--accent-purple)", width: `${Math.min(100, parseFloat(memPercent))}%`, transition: "width 0.3s" }} />
                                                        </div>
                                                    </div>
                                                    {/* Uptime */}
                                                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                                        ⏱ {formatUptime(live.uptime)}
                                                    </div>
                                                </div>
                                            )}

                                            {!isRunning && (
                                                <div style={{ fontSize: "0.82rem" }}>
                                                    <span className="badge" style={{ background: `${statusColor(vm.status)}15`, color: statusColor(vm.status), textTransform: "capitalize" }}>
                                                        {live?.status || vm.status}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                            {isRunning ? (
                                                <>
                                                    <Link
                                                        href={`/dashboard/vps/${vm.vmId}?node=${vm.node}&tab=console`}
                                                        className="btn btn-primary"
                                                        style={{ padding: "8px 16px", fontSize: "0.8rem" }}
                                                    >
                                                        🖥 Console
                                                    </Link>
                                                    <button
                                                        onClick={() => handleAction(vm.vmId, vm.node, "restart")}
                                                        disabled={actionLoading === `${vm.vmId}-restart`}
                                                        className="btn btn-ghost"
                                                        style={{ padding: "8px 12px", fontSize: "0.8rem" }}
                                                    >
                                                        {actionLoading === `${vm.vmId}-restart` ? "..." : "🔄"}
                                                    </button>
                                                    <button
                                                        onClick={() => handleAction(vm.vmId, vm.node, "stop")}
                                                        disabled={actionLoading === `${vm.vmId}-stop`}
                                                        className="btn btn-danger"
                                                        style={{ padding: "8px 16px", fontSize: "0.8rem" }}
                                                    >
                                                        {actionLoading === `${vm.vmId}-stop` ? "Stopping..." : "⏹ Stop"}
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => handleAction(vm.vmId, vm.node, "start")}
                                                    disabled={actionLoading === `${vm.vmId}-start`}
                                                    className="btn btn-primary"
                                                    style={{ padding: "8px 20px", fontSize: "0.8rem" }}
                                                >
                                                    {actionLoading === `${vm.vmId}-start` ? "Starting..." : "▶ Start"}
                                                </button>
                                            )}
                                            <Link
                                                href={`/dashboard/vps/${vm.vmId}?node=${vm.node}`}
                                                className="btn btn-ghost"
                                                style={{ padding: "8px 12px", fontSize: "0.8rem" }}
                                            >
                                                ⚙️
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
