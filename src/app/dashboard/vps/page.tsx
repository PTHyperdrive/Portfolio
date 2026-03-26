"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrialStatus {
    hasUsedTrial: boolean;
    isActive: boolean;
    isExpired: boolean;
    isPastGrace: boolean;
    daysRemaining: number;
    daysUntilDeletion: number;
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS = {
    running: { color: "#10b981", label: "Running"      },
    stopped: { color: "#ef4444", label: "Stopped"      },
    paused:  { color: "#f59e0b", label: "Paused"       },
} as const;

function getStatus(vm: VpsInstance) {
    const raw = (vm.liveData?.status ?? vm.status) as keyof typeof STATUS;
    return STATUS[raw] ?? { color: "#64748b", label: raw };
}

function formatUptime(s: number) {
    if (!s) return "—";
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatBytes(b: number) {
    if (!b) return "—";
    return `${(b / (1024 ** 3)).toFixed(1)} GB`;
}

/** Pick a colour for the OS badge */
function osColor(os: string) {
    const lower = os.toLowerCase();
    if (lower.includes("ubuntu"))  return "#e95420";
    if (lower.includes("debian"))  return "#a80030";
    if (lower.includes("centos") || lower.includes("alma") || lower.includes("rocky")) return "#262577";
    if (lower.includes("windows")) return "#0078d4";
    return "#475569";
}

/** Short OS label */
function osLabel(os: string) {
    const lower = os.toLowerCase();
    if (lower.includes("ubuntu"))  return "Ubuntu";
    if (lower.includes("debian"))  return "Debian";
    if (lower.includes("centos"))  return "CentOS";
    if (lower.includes("alma"))    return "AlmaLinux";
    if (lower.includes("rocky"))   return "Rocky";
    if (lower.includes("windows")) return "Windows";
    if (lower.includes("arch"))    return "Arch";
    return os.split(" ")[0];
}

// ── OS icon (simple SVG monochrome paths) ─────────────────────────────────────
function OsIconDot({ os }: { os: string }) {
    const color = osColor(os);
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: 4,
            background: `${color}22`, flexShrink: 0,
        }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill={color}>
                <circle cx="12" cy="12" r="10" opacity="0.7" />
            </svg>
        </span>
    );
}

// ── Action icon buttons ────────────────────────────────────────────────────────
function ActionBtn({ title, disabled, onClick, children }: {
    title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
    const [hov, setHov] = useState(false);
    return (
        <button
            title={title}
            disabled={disabled}
            onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                width: 32, height: 32, borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)",
                background: hov ? "rgba(255,255,255,0.08)" : "transparent",
                color: disabled ? "#334155" : "#94a3b8",
                cursor: disabled ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s", flexShrink: 0,
            }}
        >
            {children}
        </button>
    );
}

// ── Empty State ────────────────────────────────────────────────────────────────
function EmptyState() {
    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: "55vh", textAlign: "center", padding: "60px 40px",
        }}>
            {/* Illustration */}
            <div style={{ marginBottom: 28, position: "relative" }}>
                <div style={{
                    width: 96, height: 96, borderRadius: 24,
                    background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1))",
                    border: "1px solid rgba(59,130,246,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto",
                }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <path d="M8 21h8M12 17v4" />
                        <circle cx="12" cy="10" r="2" strokeWidth="1.5" />
                    </svg>
                </div>
                {/* Floating dots */}
                {[[-32,0],[32,0],[0,-28],[0,28]].map(([x,y], i) => (
                    <div key={i} style={{
                        position: "absolute", top: `calc(50% + ${y}px)`, left: `calc(50% + ${x}px)`,
                        width: 6, height: 6, borderRadius: "50%",
                        background: i % 2 === 0 ? "rgba(59,130,246,0.5)" : "rgba(139,92,246,0.4)",
                        transform: "translate(-50%,-50%)",
                    }} />
                ))}
            </div>

            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#f1f5f9", marginBottom: 10 }}>
                No Virtual Machines found
            </h2>
            <p style={{ fontSize: "0.9rem", color: "#64748b", maxWidth: 420, lineHeight: 1.6, marginBottom: 32 }}>
                Spin up compute resources in minutes with one click. Get started by deploying a machine.
            </p>

            <Link href="/dashboard/compute/new" style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "12px 28px", borderRadius: 10, textDecoration: "none",
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                color: "#fff", fontWeight: 700, fontSize: "0.925rem",
                boxShadow: "0 4px 20px rgba(59,130,246,0.35)",
            }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Deploy machines
            </Link>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VpsDashboard() {
    const { data: session } = useSession();
    const [instances, setInstances] = useState<VpsInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);

    const userMeta = session?.user as Record<string, unknown> | undefined;
    const hasUsedTrial = userMeta?.hasUsedTrial === true;

    useEffect(() => {
        if (!hasUsedTrial) return;
        fetch("/api/proxmox/check-trial")
            .then(r => r.json())
            .then(d => setTrialStatus(d.status ?? null))
            .catch(() => null);
    }, [hasUsedTrial]);

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
        const iv = setInterval(loadInstances, 15000);
        return () => clearInterval(iv);
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
                const d = await res.json();
                throw new Error(d.error || "Action failed");
            }
            setTimeout(loadInstances, 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed");
        } finally {
            setActionLoading(null);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const bg = "#0d1117";
    const cardStyle: React.CSSProperties = {
        background: "#161b22", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14,
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: bg }}>
            {/* ── Page Header ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
                <div>
                    <p style={{ fontSize: "0.78rem", color: "#475569", marginBottom: 6 }}>
                        Dashboard &nbsp;•&nbsp; Virtual Machine
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <path d="M8 21h8M12 17v4" />
                        </svg>
                        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f1f5f9" }}>Virtual Machines</h1>
                    </div>
                </div>

                {/* "Deploy machines" button — only shown when VMs exist */}
                {instances.length > 0 && (
                    <Link href="/dashboard/compute/new" style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "10px 20px", borderRadius: 9, textDecoration: "none",
                        background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                        color: "#fff", fontWeight: 700, fontSize: "0.875rem",
                        boxShadow: "0 2px 12px rgba(59,130,246,0.3)",
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        Deploy New Server
                    </Link>
                )}
            </div>

            {/* ── Trial Banners (preserved from original) ── */}
            {trialStatus?.isPastGrace && (
                <div style={{ padding: "14px 20px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <span>⚠️ Your trial data has been permanently deleted (33-day limit exceeded).</span>
                    <Link href="/services/vps" style={{ padding: "6px 16px", borderRadius: 7, background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: "0.8rem", textDecoration: "none" }}>View Plans</Link>
                </div>
            )}
            {trialStatus?.isExpired && !trialStatus.isPastGrace && (
                <div style={{ padding: "14px 20px", borderRadius: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <span>⏰ <strong>Trial Expired.</strong> Upgrade to keep your data — VM deletes in <strong>{trialStatus.daysUntilDeletion} day{trialStatus.daysUntilDeletion !== 1 ? "s" : ""}</strong>.</span>
                    <Link href="/payment?plan=Cloud+Starter" style={{ padding: "6px 16px", borderRadius: 7, background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: "0.8rem", textDecoration: "none" }}>Upgrade Now</Link>
                </div>
            )}
            {trialStatus?.isActive && (
                <div style={{ padding: "12px 20px", borderRadius: 10, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", color: "#10b981", marginBottom: 20, fontSize: "0.85rem" }}>
                    ✅ Trial active — <strong>{trialStatus.daysRemaining} day{trialStatus.daysRemaining !== 1 ? "s" : ""}</strong> remaining.
                </div>
            )}

            {/* ── Error Banner ── */}
            {error && (
                <div style={{ padding: "12px 16px", borderRadius: 9, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>
                    {error}
                    <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
                </div>
            )}

            {/* ── Loading ── */}
            {loading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh" }}>
                    <div style={{ textAlign: "center" }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 12,
                            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                            margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                        </div>
                        <p style={{ color: "#475569" }}>Loading your VPS instances…</p>
                    </div>
                </div>
            ) : instances.length === 0 ? (

                // ── EMPTY STATE ──────────────────────────────────────────────
                <EmptyState />

            ) : (

                // ── VM TABLE ─────────────────────────────────────────────────
                <div style={{ ...cardStyle, overflow: "hidden" }}>
                    {/* Table toolbar */}
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                            <span style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.925rem" }}>Virtual Machines</span>
                            <span style={{
                                padding: "2px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700,
                                background: "rgba(59,130,246,0.15)", color: "#3b82f6",
                            }}>{instances.length}</span>
                        </div>
                        <button
                            onClick={loadInstances}
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                padding: "6px 14px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.09)",
                                background: "transparent", color: "#94a3b8", fontSize: "0.8rem", cursor: "pointer",
                            }}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /></svg>
                            Refresh
                        </button>
                    </div>

                    {/* Table */}
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "rgba(255,255,255,0.015)" }}>
                                {["Status", "Name", "IP Address", "Configuration", "Actions"].map(h => (
                                    <th key={h} style={{
                                        padding: "11px 20px", textAlign: "left", fontSize: "0.72rem",
                                        fontWeight: 700, color: "#475569", textTransform: "uppercase",
                                        letterSpacing: "0.07em", borderBottom: "1px solid rgba(255,255,255,0.06)",
                                        whiteSpace: "nowrap",
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {instances.map((vm, idx) => {
                                const st = getStatus(vm);
                                const isRunning = st.label === "Running";
                                const live = vm.liveData;
                                const cpuPct = live?.cpu ? (live.cpu * 100).toFixed(1) : null;
                                const memUsed = live?.memory ?? 0;
                                const memMax = live?.maxmem ?? 0;

                                return (
                                    <Fragment key={vm.id}>
                                        <tr
                                            style={{
                                                borderBottom: idx < instances.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                                                transition: "background 0.12s",
                                            }}
                                            onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.018)"}
                                            onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}
                                        >
                                            {/* ── Status ── */}
                                            <td style={{ padding: "16px 20px", width: 110 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <div style={{
                                                        width: 8, height: 8, borderRadius: "50%",
                                                        background: st.color, flexShrink: 0,
                                                        boxShadow: isRunning ? `0 0 8px ${st.color}` : "none",
                                                    }} />
                                                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: st.color }}>{st.label}</span>
                                                </div>
                                                {isRunning && live && (
                                                    <div style={{ marginTop: 6 }}>
                                                        {/* Mini CPU bar */}
                                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                            <span style={{ fontSize: "0.65rem", color: "#475569", width: 24 }}>CPU</span>
                                                            <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                                                                <div style={{ height: "100%", borderRadius: 2, background: "#3b82f6", width: `${Math.min(100, parseFloat(cpuPct ?? "0"))}%` }} />
                                                            </div>
                                                            <span style={{ fontSize: "0.65rem", color: "#64748b" }}>{cpuPct}%</span>
                                                        </div>
                                                        {memMax > 0 && (
                                                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                                                                <span style={{ fontSize: "0.65rem", color: "#475569", width: 24 }}>RAM</span>
                                                                <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                                                                    <div style={{ height: "100%", borderRadius: 2, background: "#8b5cf6", width: `${Math.min(100, (memUsed / memMax) * 100)}%` }} />
                                                                </div>
                                                                <span style={{ fontSize: "0.65rem", color: "#64748b" }}>{formatBytes(memUsed)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            {/* ── Name ── */}
                                            <td style={{ padding: "16px 20px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                    <OsIconDot os={vm.os} />
                                                    <div>
                                                        <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}`} style={{
                                                            fontWeight: 700, color: "#e2e8f0", fontSize: "0.9rem", textDecoration: "none",
                                                        }}>
                                                            {vm.name}
                                                        </Link>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                                                            <span style={{ fontSize: "0.72rem", color: "#475569", fontFamily: "monospace" }}>VM #{vm.vmId}</span>
                                                            <span style={{
                                                                padding: "1px 6px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 700,
                                                                background: `${osColor(vm.os)}22`, color: osColor(vm.os),
                                                            }}>{osLabel(vm.os)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* ── IP ── */}
                                            <td style={{ padding: "16px 20px" }}>
                                                {vm.ipAddress ? (
                                                    <span style={{ fontFamily: "monospace", fontSize: "0.875rem", color: "#38bdf8", fontWeight: 600 }}>
                                                        {vm.ipAddress}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: "#334155", fontSize: "0.875rem" }}>—</span>
                                                )}
                                            </td>

                                            {/* ── Configuration ── */}
                                            <td style={{ padding: "16px 20px" }}>
                                                <div style={{ fontSize: "0.8rem", color: "#94a3b8", fontFamily: "monospace" }}>
                                                    {[
                                                        vm.specs?.vcpu   && `${vm.specs.vcpu} vCPU`,
                                                        vm.specs?.ram_gb && `${vm.specs.ram_gb} GB RAM`,
                                                        vm.specs?.disk_gb && `${vm.specs.disk_gb} GB NVMe`,
                                                    ].filter(Boolean).join(" · ") || "—"}
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
                                                    <span style={{ fontSize: "0.72rem", color: "#475569" }}>{vm.node}</span>
                                                    {isRunning && live && (
                                                        <>
                                                            <span style={{ color: "#1e293b" }}>·</span>
                                                            <span style={{ fontSize: "0.72rem", color: "#475569" }}>↑ {formatUptime(live.uptime)}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </td>

                                            {/* ── Actions ── */}
                                            <td style={{ padding: "16px 20px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    {isRunning ? (
                                                        <>
                                                            {/* Console */}
                                                            <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}&tab=console`}
                                                                title="Open Console"
                                                                style={{
                                                                    width: 32, height: 32, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                                                                    border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.1)", color: "#3b82f6",
                                                                    textDecoration: "none",
                                                                }}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
                                                            </Link>
                                                            {/* Restart */}
                                                            <ActionBtn title="Restart" disabled={actionLoading === `${vm.vmId}-restart`}
                                                                onClick={() => handleAction(vm.vmId, vm.node, "restart")}>
                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
                                                            </ActionBtn>
                                                            {/* Stop */}
                                                            <ActionBtn title="Stop" disabled={actionLoading === `${vm.vmId}-stop`}
                                                                onClick={() => handleAction(vm.vmId, vm.node, "stop")}>
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                                                            </ActionBtn>
                                                        </>
                                                    ) : (
                                                        /* Start */
                                                        <ActionBtn title="Start" disabled={actionLoading === `${vm.vmId}-start`}
                                                            onClick={() => handleAction(vm.vmId, vm.node, "start")}>
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                                        </ActionBtn>
                                                    )}
                                                    {/* Settings */}
                                                    <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}`}
                                                        title="VM Settings"
                                                        style={{
                                                            width: 32, height: 32, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                                                            border: "1px solid rgba(255,255,255,0.08)", color: "#64748b", textDecoration: "none",
                                                        }}>
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <circle cx="12" cy="12" r="3" />
                                                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                                                        </svg>
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Footer row count */}
                    <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "flex-end" }}>
                        <span style={{ fontSize: "0.75rem", color: "#334155" }}>
                            {instances.length} instance{instances.length !== 1 ? "s" : ""} total
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
