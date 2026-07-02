"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    Activity, Cpu, MemoryStick, Network, Shield, Globe,
    Wifi, WifiOff, AlertTriangle, RefreshCw, ArrowUpDown,
    Server, Clock, Gauge, ChevronRight,
} from "lucide-react";

/* ─── Types ─── */

interface MtHealthSnapshot {
    status: "online" | "offline" | "auth_denied" | "error";
    latencyMs: number;
    identity: string;
    version: string;
    uptime: string;
    cpuLoad: number;
    cpuCount: number;
    memoryUsed: number;
    memoryTotal: number;
    boardName: string;
    architecture: string;
    interfaces: {
        name: string;
        type: string;
        running: boolean;
        disabled: boolean;
        rxBytes: number;
        txBytes: number;
    }[];
    vlanCount: number;
    firewallFilterCount: number;
    firewallNatCount: number;
    healthEntries: { name: string; value: string; type: string }[];
    timestamp: string;
}

/* ─── Helpers ─── */

const formatBytes = (b: number) => {
    if (!b) return "0 B";
    if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`;
    if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
    return `${b} B`;
};

const formatMemGB = (b: number) => `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;

const STATUS_CONFIG = {
    online: { label: "Online", color: "#10b981", pulse: true },
    offline: { label: "Offline", color: "#ef4444", pulse: false },
    auth_denied: { label: "Auth Denied", color: "#f59e0b", pulse: false },
    error: { label: "Error", color: "#ef4444", pulse: false },
} as const;

/* ─── Component ─── */

export default function InfrastructurePage() {
    const t = useThemeTokens();
    const [data, setData] = useState<MtHealthSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [sseConnected, setSseConnected] = useState(false);
    const esRef = useRef<EventSource | null>(null);

    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };

    // Initial fetch
    const fetchInitial = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/mikrotik");
            if (res.ok) {
                const d = await res.json() as MtHealthSnapshot;
                setData(d);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchInitial(); }, [fetchInitial]);

    // SSE stream
    useEffect(() => {
        const es = new EventSource("/api/admin/mikrotik/health");
        esRef.current = es;

        es.onopen = () => setSseConnected(true);
        es.onmessage = (event: MessageEvent<string>) => {
            try {
                const snapshot = JSON.parse(event.data) as MtHealthSnapshot;
                setData(snapshot);
                setLoading(false);
            } catch { /* ignore */ }
        };
        es.onerror = () => setSseConnected(false);

        return () => { es.close(); esRef.current = null; };
    }, []);

    const statusCfg = data ? STATUS_CONFIG[data.status] : STATUS_CONFIG.offline;
    const memPercent = data && data.memoryTotal > 0 ? (data.memoryUsed / data.memoryTotal) * 100 : 0;

    /* ─── Loading State ─── */
    if (loading) {
        return (
            <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
                <div style={{ marginBottom: 28 }}>
                    <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>
                        Admin System <span>&bull;</span> Infrastructure
                    </p>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Infrastructure</h1>
                </div>
                {/* Skeleton cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={{ ...card, padding: 24, height: 120 }}>
                            <div style={{
                                width: "60%", height: 14, borderRadius: 4,
                                background: `linear-gradient(90deg, ${t.bgSecondary} 25%, ${t.bgTertiary} 50%, ${t.bgSecondary} 75%) 0 0 / 200% 100%`,
                                animation: "shimmer 1.5s infinite",
                            }} />
                        </div>
                    ))}
                </div>
                <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
            </div>
        );
    }

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Admin System <span>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Infrastructure</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Activity style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>MikroTik Gateway</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Real-time health monitoring for the network gateway.</p>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                            fontSize: "0.68rem", fontWeight: 700, padding: "4px 10px",
                            borderRadius: 20, display: "flex", alignItems: "center", gap: 5,
                            background: sseConnected ? t.statusSuccessBg : t.statusErrorBg,
                            color: sseConnected ? t.statusSuccess : t.statusError,
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                            {sseConnected ? "LIVE" : "DISCONNECTED"}
                        </span>
                        <button
                            id="infra-refresh"
                            onClick={fetchInitial}
                            style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                                borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`,
                                background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer",
                            }}
                        >
                            <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Router Status Banner ─── */}
            <div style={{
                ...card,
                padding: "20px 24px",
                marginBottom: 20,
                borderLeft: `4px solid ${statusCfg.color}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 12,
                        background: `${statusCfg.color}18`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        {data?.status === "online"
                            ? <Wifi style={{ width: 24, height: 24, color: statusCfg.color }} />
                            : data?.status === "auth_denied"
                                ? <AlertTriangle style={{ width: 24, height: 24, color: statusCfg.color }} />
                                : <WifiOff style={{ width: 24, height: 24, color: statusCfg.color }} />
                        }
                    </div>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                            <span style={{
                                fontSize: "0.72rem", fontWeight: 800, padding: "3px 10px",
                                borderRadius: 20, background: `${statusCfg.color}18`,
                                color: statusCfg.color, textTransform: "uppercase", letterSpacing: "0.06em",
                            }}>
                                {statusCfg.label}
                            </span>
                            {data?.latencyMs !== undefined && data.latencyMs > 0 && (
                                <span style={{ fontSize: "0.75rem", color: t.textMuted, fontFamily: t.fontMono }}>
                                    {data.latencyMs}ms
                                </span>
                            )}
                        </div>
                        <p style={{ fontSize: "1.1rem", fontWeight: 700, color: t.textPrimary }}>
                            {data?.identity || "Unknown Router"}
                        </p>
                        <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 2 }}>
                            {data?.boardName || "—"} ({data?.architecture || "—"}) &middot; RouterOS {data?.version || "—"}
                        </p>
                    </div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                        <Clock style={{ width: 13, height: 13, color: t.textMuted }} />
                        <span style={{ fontSize: "0.82rem", color: t.textSecondary, fontFamily: t.fontMono }}>
                            {data?.uptime || "—"}
                        </span>
                    </div>
                    {data?.timestamp && (
                        <p style={{ fontSize: "0.68rem", color: t.textMuted, marginTop: 4 }}>
                            Last update: {new Date(data.timestamp).toLocaleTimeString()}
                        </p>
                    )}
                </div>
            </div>

            {/* ─── Resource Gauges ─── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
                {/* CPU */}
                <div style={{ ...card, padding: 22 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <Cpu style={{ width: 16, height: 16, color: t.textMuted }} />
                        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            CPU Load
                        </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
                        <span style={{ fontSize: "2rem", fontWeight: 800, color: t.accentPrimary, fontFamily: t.fontMono }}>
                            {data?.cpuLoad ?? 0}
                        </span>
                        <span style={{ fontSize: "0.85rem", color: t.textMuted }}>%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: t.borderPrimary }}>
                        <div style={{
                            height: "100%", borderRadius: 3,
                            background: (data?.cpuLoad ?? 0) > 80 ? t.statusError : t.accentPrimary,
                            width: `${Math.min(100, data?.cpuLoad ?? 0)}%`,
                            transition: "width 0.5s",
                        }} />
                    </div>
                    <p style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 6 }}>
                        {data?.cpuCount ?? 0} core{(data?.cpuCount ?? 0) !== 1 ? "s" : ""}
                    </p>
                </div>

                {/* Memory */}
                <div style={{ ...card, padding: 22 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <MemoryStick style={{ width: 16, height: 16, color: t.textMuted }} />
                        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            Memory
                        </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
                        <span style={{ fontSize: "2rem", fontWeight: 800, color: t.statusSuccess, fontFamily: t.fontMono }}>
                            {memPercent.toFixed(0)}
                        </span>
                        <span style={{ fontSize: "0.85rem", color: t.textMuted }}>%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: t.borderPrimary }}>
                        <div style={{
                            height: "100%", borderRadius: 3,
                            background: memPercent > 85 ? t.statusError : t.statusSuccess,
                            width: `${Math.min(100, memPercent)}%`,
                            transition: "width 0.5s",
                        }} />
                    </div>
                    <p style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 6 }}>
                        {data ? formatMemGB(data.memoryUsed) : "0 GB"} / {data ? formatMemGB(data.memoryTotal) : "0 GB"}
                    </p>
                </div>

                {/* Firewall */}
                <div style={{ ...card, padding: 22 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <Shield style={{ width: 16, height: 16, color: t.textMuted }} />
                        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            Firewall
                        </span>
                    </div>
                    <div style={{ display: "flex", gap: 24 }}>
                        <div>
                            <span style={{ fontSize: "2rem", fontWeight: 800, color: t.statusWarning, fontFamily: t.fontMono }}>
                                {data?.firewallFilterCount ?? 0}
                            </span>
                            <p style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 2 }}>Filter Rules</p>
                        </div>
                        <div>
                            <span style={{ fontSize: "2rem", fontWeight: 800, color: t.accentSecondary, fontFamily: t.fontMono }}>
                                {data?.firewallNatCount ?? 0}
                            </span>
                            <p style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 2 }}>NAT Rules</p>
                        </div>
                        <div>
                            <span style={{ fontSize: "2rem", fontWeight: 800, color: t.accentPrimary, fontFamily: t.fontMono }}>
                                {data?.vlanCount ?? 0}
                            </span>
                            <p style={{ fontSize: "0.72rem", color: t.textMuted, marginTop: 2 }}>VLANs</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Interface Table ─── */}
            <div style={{ ...card, marginBottom: 24 }}>
                <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ArrowUpDown style={{ width: 14, height: 14, color: t.textMuted }} />
                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>
                            Interfaces
                        </span>
                        <span style={{
                            fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px",
                            borderRadius: 20, background: t.accentPrimaryMuted, color: t.accentPrimary,
                        }}>
                            {data?.interfaces?.length ?? 0}
                        </span>
                    </div>
                </div>

                {!data?.interfaces?.length ? (
                    <div style={{ padding: "40px 24px", textAlign: "center", color: t.textMuted, fontSize: "0.88rem" }}>
                        No interface data available
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 680, borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: t.bgSecondary }}>
                                {["Status", "Name", "Type", "RX", "TX"].map(h => (
                                    <th key={h} style={{
                                        padding: "10px 16px", textAlign: "left", fontSize: "0.68rem",
                                        fontWeight: 700, color: t.textMuted, textTransform: "uppercase",
                                        letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}`,
                                        whiteSpace: "nowrap",
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.interfaces.map((iface, idx) => {
                                const isUp = iface.running && !iface.disabled;
                                const isVlan = iface.type === "vlan";
                                return (
                                    <tr
                                        key={iface.name}
                                        style={{ borderBottom: idx < data.interfaces.length - 1 ? `1px solid ${t.borderSecondary}` : "none" }}
                                        onMouseEnter={e => (e.currentTarget.style.background = t.bgCardHover)}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                    >
                                        <td style={{ padding: "10px 16px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span style={{
                                                    width: 7, height: 7, borderRadius: "50%",
                                                    background: iface.disabled ? t.textMuted : isUp ? t.statusSuccess : t.statusError,
                                                }} />
                                                <span style={{
                                                    fontSize: "0.72rem", fontWeight: 700,
                                                    color: iface.disabled ? t.textMuted : isUp ? t.statusSuccess : t.statusError,
                                                }}>
                                                    {iface.disabled ? "disabled" : isUp ? "up" : "down"}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={{ padding: "10px 16px" }}>
                                            <span style={{ fontWeight: 600, color: t.textPrimary, fontSize: "0.85rem", fontFamily: t.fontMono }}>
                                                {iface.name}
                                            </span>
                                        </td>
                                        <td style={{ padding: "10px 16px" }}>
                                            <span style={{
                                                fontSize: "0.72rem", fontWeight: 600,
                                                padding: "2px 8px", borderRadius: 4,
                                                background: isVlan ? t.accentPrimaryMuted : t.bgSecondary,
                                                color: isVlan ? t.accentPrimary : t.textMuted,
                                            }}>
                                                {iface.type}
                                            </span>
                                        </td>
                                        <td style={{ padding: "10px 16px", fontFamily: t.fontMono, fontSize: "0.78rem", color: t.statusSuccess }}>
                                            {formatBytes(iface.rxBytes)}
                                        </td>
                                        <td style={{ padding: "10px 16px", fontFamily: t.fontMono, fontSize: "0.78rem", color: t.accentPrimary }}>
                                            {formatBytes(iface.txBytes)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                )}
            </div>

            {/* ─── Hardware Health (if available) ─── */}
            {data?.healthEntries && data.healthEntries.length > 0 && (
                <div style={{ ...card, padding: 22 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                        <Gauge style={{ width: 16, height: 16, color: t.textMuted }} />
                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>Hardware Sensors</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                        {data.healthEntries.map(entry => (
                            <div key={entry.name} style={{
                                padding: "12px 16px", borderRadius: t.cardRadius,
                                background: t.bgSecondary, border: `1px solid ${t.borderSecondary}`,
                            }}>
                                <p style={{ fontSize: "0.68rem", color: t.textMuted, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
                                    {entry.name.replace(/-/g, " ")}
                                </p>
                                <p style={{ fontSize: "1.1rem", fontWeight: 800, color: t.textPrimary, fontFamily: t.fontMono }}>
                                    {entry.value}{entry.type ? ` ${entry.type}` : ""}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
