"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";

import Link from "next/link";
import { WINDOWS_ISOS, getIsosByCategory } from "@/lib/windows-isos";

interface VmDetail {
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
        disk: number;
        maxdisk: number;
        netin: number;
        netout: number;
    } | null;
}

export default function VmDetailPage({ params }: { params: Promise<{ vmId: string }> }) {
    const { vmId } = use(params);
    const searchParams = useSearchParams();
    const node = searchParams.get("node") || "";
    const initialTab = searchParams.get("tab") || "overview";

    const [vm, setVm] = useState<VmDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState(initialTab);
    const [actionLoading, setActionLoading] = useState("");
    const [selectedIso, setSelectedIso] = useState<string>(WINDOWS_ISOS[0].id);
    const [error, setError] = useState("");

    // Destroy Modal State
    const [showDestroy, setShowDestroy] = useState(false);
    const [destroyPwd, setDestroyPwd] = useState("");
    const [destroyLoading, setDestroyLoading] = useState(false);
    const [destroyErr, setDestroyErr] = useState("");

    const loadVm = useCallback(async () => {
        try {
            const res = await fetch(`/api/proxmox/vms/${vmId}?node=${node}`);
            if (!res.ok) throw new Error("Failed to load VM");
            const data = await res.json();
            setVm(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [vmId, node]);

    useEffect(() => {
        loadVm();
        const interval = setInterval(loadVm, 10000);
        return () => clearInterval(interval);
    }, [loadVm]);

    const handleAction = async (action: string, isoId?: string) => {
        setActionLoading(action);
        setError("");
        try {
            const res = await fetch(`/api/proxmox/vms/${vmId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, node, isoId }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Action failed");
            }
            setTimeout(loadVm, 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed");
        } finally {
            setActionLoading("");
        }
    };

    const handleDestroy = async (e: React.FormEvent) => {
        e.preventDefault();
        setDestroyLoading(true);
        setDestroyErr("");
        try {
            const res = await fetch(`/api/proxmox/vms/${vmId}/destroy`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: destroyPwd, node }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Destroy failed");

            // Redirect away on success
            window.location.href = "/dashboard/vps";
        } catch (err) {
            setDestroyErr(err instanceof Error ? err.message : "Failed to destroy the instance");
            setDestroyLoading(false);
        }
    };

    const formatUptime = (s: number) => {
        if (!s) return "—";
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
        return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const formatBytes = (b: number) => {
        if (!b) return "0";
        if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`;
        if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
        if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
        return `${(b / 1e3).toFixed(0)} KB`;
    };

    if (loading) {
        return (
            <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "100px" }}>
                <p style={{ color: "var(--text-muted)" }}>Loading VM details...</p>
            </div>
        );
    }

    if (!vm) {
        return (
            <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "100px" }}>
                <div style={{ textAlign: "center" }}>
                    <h2 style={{ marginBottom: "12px" }}>VM Not Found</h2>
                    <Link href="/dashboard/vps" className="btn btn-secondary">← Back to VPS</Link>
                </div>
            </div>
        );
    }

    const live = vm.liveData;
    const isRunning = (live?.status || vm.status) === "running";
    const cpuPercent = live?.cpu ? (live.cpu * 100) : 0;
    const memUsed = live?.memory || 0;
    const memTotal = live?.maxmem || 0;
    const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
    const diskUsed = live?.disk || 0;
    const diskTotal = live?.maxdisk || 0;
    const diskPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;
    const isoCategories = getIsosByCategory();

    const tabs = [
        { id: "overview", label: "Overview", icon: "📊" },
        { id: "console", label: "Console", icon: "🖥" },
        { id: "settings", label: "Settings", icon: "⚙️" },
    ];

    return (
        <div style={{ paddingTop: "120px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container">
                {/* Breadcrumb + Header */}
                <div style={{ marginBottom: "32px" }}>
                    <Link href="/dashboard/vps" style={{ color: "var(--text-muted)", fontSize: "0.85rem", textDecoration: "none" }}>
                        ← Back to VPS Instances
                    </Link>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", flexWrap: "wrap", gap: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                            <div style={{
                                width: 12, height: 12, borderRadius: "50%",
                                background: isRunning ? "var(--accent-green)" : "var(--accent-magenta)",
                                boxShadow: isRunning ? "0 0 12px var(--accent-green)" : "none",
                            }} />
                            <div>
                                <h1 style={{ fontSize: "1.8rem", fontWeight: 800 }}>{vm.name}</h1>
                                <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                                    <span className="mono" style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>VM {vm.vmId}</span>
                                    <span style={{ color: "var(--text-muted)" }}>•</span>
                                    <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{vm.node}</span>
                                    <span style={{ color: "var(--text-muted)" }}>•</span>
                                    <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{vm.os}</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: "10px" }}>
                            {isRunning ? (
                                <>
                                    <button onClick={() => handleAction("restart")} disabled={!!actionLoading} className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "0.85rem" }}>
                                        {actionLoading === "restart" ? "..." : "🔄 Restart"}
                                    </button>
                                    <button onClick={() => handleAction("stop")} disabled={!!actionLoading} className="btn btn-danger" style={{ padding: "8px 16px", fontSize: "0.85rem" }}>
                                        {actionLoading === "stop" ? "Stopping..." : "⏹ Stop"}
                                    </button>
                                </>
                            ) : (
                                <button onClick={() => handleAction("start")} disabled={!!actionLoading} className="btn btn-primary" style={{ padding: "8px 20px", fontSize: "0.85rem" }}>
                                    {actionLoading === "start" ? "Starting..." : "▶ Start"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {error && (
                    <div style={{ padding: "14px 20px", borderRadius: "var(--radius-sm)", background: "rgba(255,0,110,0.1)", border: "1px solid rgba(255,0,110,0.2)", color: "var(--accent-magenta)", marginBottom: "24px", fontSize: "0.9rem" }}>
                        {error}
                        <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: "flex", gap: "4px", marginBottom: "28px", borderBottom: "1px solid var(--glass-border)", paddingBottom: "0" }}>
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            style={{
                                padding: "12px 20px",
                                background: tab === t.id ? "rgba(0, 240, 255, 0.08)" : "transparent",
                                border: "none",
                                borderBottom: tab === t.id ? "2px solid var(--accent-cyan)" : "2px solid transparent",
                                color: tab === t.id ? "var(--accent-cyan)" : "var(--text-muted)",
                                cursor: "pointer",
                                fontSize: "0.9rem",
                                fontWeight: 600,
                                transition: "all 0.2s",
                            }}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {tab === "overview" && (
                    <div>
                        {/* Resource Usage */}
                        <div className="grid-3" style={{ marginBottom: "28px" }}>
                            {/* CPU */}
                            <div className="glass-card" style={{ padding: "24px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 600 }}>CPU Usage</span>
                                    <span className="mono" style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent-cyan)" }}>{cpuPercent.toFixed(1)}%</span>
                                </div>
                                <div style={{ height: "8px", borderRadius: "4px", background: "rgba(255,255,255,0.06)" }}>
                                    <div style={{ height: "100%", borderRadius: "4px", background: "var(--gradient-primary)", width: `${Math.min(100, cpuPercent)}%`, transition: "width 0.5s" }} />
                                </div>
                                <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "8px" }}>{vm.specs?.vcpu || "—"} vCPU Cores</p>
                            </div>
                            {/* Memory */}
                            <div className="glass-card" style={{ padding: "24px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 600 }}>Memory</span>
                                    <span className="mono" style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent-purple)" }}>{formatBytes(memUsed)}</span>
                                </div>
                                <div style={{ height: "8px", borderRadius: "4px", background: "rgba(255,255,255,0.06)" }}>
                                    <div style={{ height: "100%", borderRadius: "4px", background: "linear-gradient(135deg, #8b5cf6, #a78bfa)", width: `${Math.min(100, memPercent)}%`, transition: "width 0.5s" }} />
                                </div>
                                <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "8px" }}>{formatBytes(memUsed)} / {formatBytes(memTotal)}</p>
                            </div>
                            {/* Disk */}
                            <div className="glass-card" style={{ padding: "24px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 600 }}>Disk</span>
                                    <span className="mono" style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent-green)" }}>{formatBytes(diskUsed)}</span>
                                </div>
                                <div style={{ height: "8px", borderRadius: "4px", background: "rgba(255,255,255,0.06)" }}>
                                    <div style={{ height: "100%", borderRadius: "4px", background: "linear-gradient(135deg, #00ff88, #00cc66)", width: `${Math.min(100, diskPercent)}%`, transition: "width 0.5s" }} />
                                </div>
                                <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "8px" }}>{formatBytes(diskUsed)} / {formatBytes(diskTotal)}</p>
                            </div>
                        </div>

                        {/* Info Grid */}
                        <div className="grid-2" style={{ marginBottom: "28px" }}>
                            <div className="glass-card" style={{ padding: "24px" }}>
                                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "16px", color: "var(--text-secondary)" }}>Instance Details</h3>
                                {[
                                    ["Status", live?.status || vm.status],
                                    ["Uptime", isRunning ? formatUptime(live?.uptime || 0) : "—"],
                                    ["OS", vm.os],
                                    ["IP Address", vm.ipAddress || "Not assigned"],
                                    ["Node", vm.node],
                                    ["VM ID", vm.vmId],
                                ].map(([label, value]) => (
                                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.88rem" }}>
                                        <span style={{ color: "var(--text-muted)" }}>{label}</span>
                                        <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="glass-card" style={{ padding: "24px" }}>
                                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "16px", color: "var(--text-secondary)" }}>Hardware Specs</h3>
                                {[
                                    ["vCPU", `${vm.specs?.vcpu || "—"} Cores`],
                                    ["RAM", `${vm.specs?.ram_gb || "—"} GB`],
                                    ["Disk", `${vm.specs?.disk_gb || "—"} GB NVMe`],
                                    ["GPU", vm.specs?.gpu || "None"],
                                    ["Network In", formatBytes(live?.netin || 0)],
                                    ["Network Out", formatBytes(live?.netout || 0)],
                                ].map(([label, value]) => (
                                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.88rem" }}>
                                        <span style={{ color: "var(--text-muted)" }}>{label}</span>
                                        <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {tab === "console" && (
                    <div>
                        {isRunning ? (
                            <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
                                <div style={{ fontSize: "3rem", marginBottom: "16px" }}>🖥️</div>
                                <h3 style={{ marginBottom: "8px", fontSize: "1.2rem" }}>Remote Console</h3>
                                <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "24px", maxWidth: "480px", margin: "0 auto 24px" }}>
                                    Download the SPICE connection file and open it with <strong style={{ color: "var(--text-secondary)" }}>virt-viewer</strong> to connect to your VM&apos;s console.
                                </p>
                                <a
                                    href={`/api/proxmox/spice/download?vmId=${vm.vmId}&node=${vm.node}`}
                                    download
                                    className="btn btn-primary"
                                    style={{ padding: "12px 28px", fontSize: "0.95rem", textDecoration: "none", display: "inline-block" }}
                                >
                                    📁 Download SPICE Console (.vv)
                                </a>
                                <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "16px" }}>
                                    Requires <a href="https://virt-manager.org/download/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-cyan)" }}>virt-viewer</a> installed on your system.
                                </p>
                            </div>
                        ) : (
                            <div className="glass-card" style={{ padding: "60px", textAlign: "center" }}>
                                <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>🔌</div>
                                <h3 style={{ marginBottom: "8px" }}>VM is not running</h3>
                                <p style={{ color: "var(--text-muted)", marginBottom: "20px" }}>Start the VM to access the console.</p>
                                <button onClick={() => handleAction("start")} disabled={!!actionLoading} className="btn btn-primary">
                                    {actionLoading === "start" ? "Starting..." : "▶ Start VM"}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {tab === "settings" && (
                    <div>
                        {/* OS Reinstall */}
                        <div className="glass-card" style={{ padding: "28px", marginBottom: "20px" }}>
                            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "8px" }}>
                                🔄 Reinstall Operating System
                            </h3>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "20px" }}>
                                Select a Windows ISO to reinstall. This will stop the VM, change the boot ISO, and restart it.
                                <br />
                                <strong style={{ color: "var(--accent-magenta)" }}>Warning: This may erase all data on the VM.</strong>
                            </p>
                            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
                                <div style={{ flex: 1, minWidth: "250px" }}>
                                    <label style={{ display: "block", fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "6px" }}>
                                        Windows Version
                                    </label>
                                    <select
                                        value={selectedIso}
                                        onChange={(e) => setSelectedIso(e.target.value)}
                                        className="input-field"
                                        style={{ cursor: "pointer", color: "var(--text-primary)", background: "rgba(255,255,255,0.05)" }}
                                    >
                                        {Object.entries(isoCategories).map(([category, isos]) => (
                                            <optgroup key={category} label={category} style={{ color: "#000", background: "#fff" }}>
                                                {isos.map((iso) => (
                                                    <option key={iso.id} value={iso.id} style={{ color: "#000", background: "#fff" }}>
                                                        {iso.name}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={() => {
                                        if (confirm(`Are you sure you want to reinstall with ${WINDOWS_ISOS.find(i => i.id === selectedIso)?.name}? This may erase all data.`)) {
                                            handleAction("reinstall", selectedIso);
                                        }
                                    }}
                                    disabled={!!actionLoading}
                                    className="btn btn-danger"
                                    style={{ padding: "12px 24px" }}
                                >
                                    {actionLoading === "reinstall" ? "Reinstalling..." : "🔄 Reinstall"}
                                </button>
                            </div>
                        </div>

                        {/* VM Info */}
                        <div className="glass-card" style={{ padding: "28px", marginBottom: "32px" }}>
                            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "16px" }}>📋 Instance Information</h3>
                            <div className="mono" style={{ fontSize: "0.82rem", color: "var(--text-muted)", padding: "16px", background: "rgba(0,0,0,0.3)", borderRadius: "var(--radius-sm)" }}>
                                <div>Instance ID: {vm.id}</div>
                                <div>Proxmox VM ID: {vm.vmId}</div>
                                <div>Node: {vm.node}</div>
                                <div>Created: {new Date(vm.expiresAt || "").toLocaleDateString() || "—"}</div>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div>
                            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent-magenta)", marginBottom: "16px" }}>🔥 Danger Zone</h3>
                            <div className="glass-card" style={{ padding: "28px", border: "1px solid rgba(255,0,110,0.3)", background: "rgba(255,0,110,0.03)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                                    <div>
                                        <h4 style={{ fontWeight: 700, marginBottom: "4px" }}>Destroy Instance</h4>
                                        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", maxWidth: "400px" }}>
                                            Permanently delete this instance and all its associated data. This action cannot be undone.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowDestroy(true)}
                                        className="btn btn-danger"
                                        style={{ padding: "10px 24px", whiteSpace: "nowrap" }}
                                    >
                                        Destroy Instance
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Destroy Modal Overlay */}
            {showDestroy && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                    <div className="glass-card" style={{ width: "100%", maxWidth: "480px", padding: "32px", border: "1px solid rgba(255,0,110,0.4)", boxShadow: "0 10px 40px rgba(255,0,110,0.2)" }}>
                        <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ color: "var(--accent-magenta)" }}>⚠️</span> Confirm Destruction
                        </h2>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: "24px", lineHeight: 1.6 }}>
                            Are you absolutely sure you want to completely destroy the instance <strong>{vm.name}</strong>? All data will be wiped permanently.
                        </p>
                        <form onSubmit={handleDestroy}>
                            <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px" }}>
                                Enter your account password to verify:
                            </label>
                            <input
                                type="password"
                                required
                                value={destroyPwd}
                                onChange={(e) => setDestroyPwd(e.target.value)}
                                className="input-field"
                                style={{ width: "100%", marginBottom: "16px", background: "rgba(0,0,0,0.2)" }}
                                placeholder="••••••••"
                            />
                            {destroyErr && (
                                <p style={{ color: "var(--accent-magenta)", fontSize: "0.85rem", marginBottom: "16px" }}>{destroyErr}</p>
                            )}
                            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                                <button
                                    type="button"
                                    onClick={() => { setShowDestroy(false); setDestroyPwd(""); setDestroyErr(""); }}
                                    className="btn btn-ghost"
                                    disabled={destroyLoading}
                                >
                                    Cancel
                                </button>
                                <button type="submit" disabled={destroyLoading || !destroyPwd} className="btn btn-danger" style={{ padding: "10px 24px" }}>
                                    {destroyLoading ? "Destroying..." : "Confirm Destroy"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
