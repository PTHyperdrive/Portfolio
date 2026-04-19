"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useThemeTokens } from "@/lib/useThemeTokens";

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

interface PageMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_MAP = {
    running: { label: "Running" },
    stopped: { label: "Stopped" },
    paused:  { label: "Paused"  },
} as const;

function getStatusColor(vm: VpsInstance, t: ReturnType<typeof useThemeTokens>) {
    const raw = (vm.liveData?.status ?? vm.status) as keyof typeof STATUS_MAP;
    const meta = STATUS_MAP[raw] ?? { label: raw };
    const color = raw === "running" ? t.statusSuccess : raw === "stopped" ? t.statusError : t.statusWarning;
    return { color, label: meta.label };
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

function osLabel(os: string) {
    const l = os.toLowerCase();
    if (l.includes("ubuntu"))  return "Ubuntu";
    if (l.includes("debian"))  return "Debian";
    if (l.includes("centos"))  return "CentOS";
    if (l.includes("alma"))    return "AlmaLinux";
    if (l.includes("rocky"))   return "Rocky";
    if (l.includes("windows")) return "Windows";
    return os.split(" ")[0];
}

function useDebounce<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function VpsDashboard() {
    const { data: session } = useSession();
    const t = useThemeTokens();

    // ── Filter state
    const [searchInput, setSearchInput] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [sortKey, setSortKey] = useState("createdAt_desc");
    const [page, setPage] = useState(1);
    const LIMIT = 10;
    const search = useDebounce(searchInput, 300);

    // ── Data state
    const [instances, setInstances] = useState<VpsInstance[]>([]);
    const [meta, setMeta] = useState<PageMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);

    const userMeta = session?.user as Record<string, unknown> | undefined;
    const hasUsedTrial = userMeta?.hasUsedTrial === true;

    useEffect(() => { setPage(1); }, [search, statusFilter, sortKey]);

    const fetchRef = useRef<AbortController | null>(null);

    const loadInstances = useCallback(async (silent = false) => {
        fetchRef.current?.abort();
        const ctrl = new AbortController();
        fetchRef.current = ctrl;
        if (!silent) setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), search, status: statusFilter, sort: sortKey });
            const res = await fetch(`/api/proxmox/vms?${params}`, { signal: ctrl.signal });
            if (!res.ok) throw new Error("Failed to load VMs");
            const data = await res.json();
            setInstances(data.instances ?? []);
            setMeta(data.meta ?? null);
            setError("");
        } catch (err: unknown) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            if (!silent) setLoading(false);
        }
    }, [page, search, statusFilter, sortKey]);

    useEffect(() => { loadInstances(); }, [loadInstances]);
    useEffect(() => { const iv = setInterval(() => loadInstances(true), 15_000); return () => clearInterval(iv); }, [loadInstances]);

    useEffect(() => {
        if (!hasUsedTrial) return;
        fetch("/api/proxmox/check-trial").then(r => r.json()).then(d => setTrialStatus(d.status ?? null)).catch(() => null);
    }, [hasUsedTrial]);

    const handleAction = async (vmId: string, node: string, action: string) => {
        setActionLoading(`${vmId}-${action}`);
        try {
            const res = await fetch(`/api/proxmox/vms/${vmId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, node }) });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Action failed"); }
            setTimeout(() => loadInstances(true), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed");
        } finally { setActionLoading(null); }
    };

    const clearFilters = () => { setSearchInput(""); setStatusFilter(""); setSortKey("createdAt_desc"); setPage(1); };
    const hasFilters = !!(searchInput || statusFilter);

    // ── Shared styles
    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const inputStyle: React.CSSProperties = {
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.isMono ? 4 : 8, color: t.textPrimary, fontSize: "0.85rem", outline: "none",
        padding: "8px 12px", transition: "border-color 0.15s",
    };

    // ── Pagination
    const renderPagination = () => {
        if (!meta || meta.totalPages <= 1) return null;
        const pages: (number | "…")[] = [];
        const cur = meta.page, total = meta.totalPages;
        if (total <= 7) { for (let i = 1; i <= total; i++) pages.push(i); }
        else { pages.push(1); if (cur > 3) pages.push("…"); for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) pages.push(i); if (cur < total - 2) pages.push("…"); pages.push(total); }

        const pb = (active: boolean, disabled?: boolean): React.CSSProperties => ({
            minWidth: 34, height: 34, padding: "0 10px", borderRadius: t.isMono ? 4 : 8,
            border: `1px solid ${active ? t.accentPrimary : t.borderPrimary}`,
            background: active ? t.accentPrimaryMuted : "transparent",
            color: active ? t.accentPrimary : disabled ? t.borderSecondary : t.textMuted,
            fontWeight: active ? 700 : 500, fontSize: "0.82rem",
            cursor: disabled ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s",
        });

        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: `1px solid ${t.borderSecondary}` }}>
                <span style={{ fontSize: "0.78rem", color: t.textMuted }}>
                    Showing {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of <strong style={{ color: t.textSecondary }}>{meta.total}</strong> instances
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button disabled={!meta.hasPrevPage} onClick={() => setPage(meta.page - 1)} style={pb(false, !meta.hasPrevPage)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    {pages.map((p, i) => p === "…"
                        ? <span key={`e-${i}`} style={{ color: t.textMuted, fontSize: "0.82rem", padding: "0 4px" }}>…</span>
                        : <button key={p} onClick={() => setPage(p as number)} style={pb(p === cur)}>{p}</button>
                    )}
                    <button disabled={!meta.hasNextPage} onClick={() => setPage(meta.page + 1)} style={pb(false, !meta.hasNextPage)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>

            {/* ── Page Header ── */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
                <div>
                    <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6 }}>Dashboard &nbsp;•&nbsp; Virtual Machine</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={t.accentPrimary} strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Virtual Machines</h1>
                        {meta && meta.total > 0 && (
                            <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: t.accentPrimaryMuted, color: t.accentPrimary }}>{meta.total}</span>
                        )}
                    </div>
                </div>
                {meta && meta.total > 0 && (
                    <Link href="/dashboard/compute/new" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: t.buttonRadius, textDecoration: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", boxShadow: t.shadow, marginTop: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        Deploy New Server
                    </Link>
                )}
            </div>

            {/* ── Trial Banners ── */}
            {trialStatus?.isPastGrace && (
                <div style={{ padding: "14px 20px", borderRadius: t.isMono ? 4 : 10, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>⚠️ Trial data permanently deleted (33-day limit exceeded).</span>
                    <Link href="/services/vps" style={{ padding: "6px 16px", borderRadius: t.buttonRadius, background: t.statusError, color: "#fff", fontWeight: 700, fontSize: "0.8rem", textDecoration: "none" }}>View Plans</Link>
                </div>
            )}
            {trialStatus?.isExpired && !trialStatus.isPastGrace && (
                <div style={{ padding: "14px 20px", borderRadius: t.isMono ? 4 : 10, background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`, color: t.statusWarning, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>⏰ <strong>Trial Expired.</strong> VM deletes in <strong>{trialStatus.daysUntilDeletion} day(s)</strong>.</span>
                    <Link href="/payment?plan=Cloud+Starter" style={{ padding: "6px 16px", borderRadius: t.buttonRadius, background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.8rem", textDecoration: "none" }}>Upgrade Now</Link>
                </div>
            )}
            {trialStatus?.isActive && (
                <div style={{ padding: "12px 20px", borderRadius: t.isMono ? 4 : 10, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}22`, color: t.statusSuccess, marginBottom: 20, fontSize: "0.85rem" }}>
                    ✅ Trial active — <strong>{trialStatus.daysRemaining} day(s)</strong> remaining.
                </div>
            )}

            {/* ── Error Banner ── */}
            {error && (
                <div style={{ padding: "12px 16px", borderRadius: t.isMono ? 4 : 9, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>
                    {error}
                    <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
                </div>
            )}

            {/* ── Main Card ── */}
            <div style={card}>

                {/* ── Toolbar ── */}
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
                        <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                        <input id="vm-search" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search by name, OS, IP, VM ID…" style={{ ...inputStyle, width: "100%", paddingLeft: 32, boxSizing: "border-box" }} />
                        {searchInput && (
                            <button onClick={() => setSearchInput("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t.textMuted, cursor: "pointer", padding: 2 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
                            </button>
                        )}
                    </div>
                    <select id="vm-status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, cursor: "pointer", paddingRight: 28 }}>
                        <option value="">All Status</option>
                        <option value="running">🟢 Running</option>
                        <option value="stopped">🔴 Stopped</option>
                        <option value="paused">🟡 Paused</option>
                    </select>
                    <select id="vm-sort" value={sortKey} onChange={e => setSortKey(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                        <option value="createdAt_desc">Newest first</option>
                        <option value="createdAt_asc">Oldest first</option>
                        <option value="name_asc">Name A→Z</option>
                        <option value="name_desc">Name Z→A</option>
                    </select>
                    {hasFilters && (
                        <button onClick={clearFilters} style={{ ...inputStyle, cursor: "pointer", color: t.statusWarning, borderColor: `${t.statusWarning}33`, background: t.statusWarningBg, whiteSpace: "nowrap" }}>✕ Clear</button>
                    )}
                    <div style={{ flex: "0 0 auto", marginLeft: "auto" }}>
                        <button onClick={() => loadInstances()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.isMono ? 4 : 7, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                            </svg> Refresh
                        </button>
                    </div>
                </div>

                {/* ── Content ── */}
                {loading ? (
                    <div style={{ padding: "0 20px" }}>
                        {[...Array(3)].map((_, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 0", borderBottom: i < 2 ? `1px solid ${t.borderSecondary}` : "none" }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.borderPrimary }} />
                                <div style={{ flex: 1, height: 14, borderRadius: 6, background: t.borderSecondary }} />
                                <div style={{ width: 100, height: 14, borderRadius: 6, background: t.borderSecondary }} />
                                <div style={{ width: 140, height: 14, borderRadius: 6, background: t.borderSecondary }} />
                            </div>
                        ))}
                    </div>
                ) : instances.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", textAlign: "center", padding: "60px 40px" }}>
                        <div style={{ width: 96, height: 96, borderRadius: t.isMono ? 12 : 24, background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px" }}>
                            {hasFilters
                                ? <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={t.accentPrimary} strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                                : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={t.accentPrimary} strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /><circle cx="12" cy="10" r="2" /></svg>
                            }
                        </div>
                        <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: t.textPrimary, marginBottom: 10 }}>{hasFilters ? "No results found" : "No Virtual Machines yet"}</h2>
                        <p style={{ fontSize: "0.875rem", color: t.textMuted, maxWidth: 380, lineHeight: 1.6, marginBottom: 28 }}>
                            {hasFilters ? "Try adjusting your search or filter to find what you're looking for." : "Spin up compute resources in minutes with one click."}
                        </p>
                        {hasFilters ? (
                            <button onClick={clearFilters} style={{ padding: "10px 24px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: t.bgCardHover, color: t.textSecondary, fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}>Clear filters</button>
                        ) : (
                            <Link href="/dashboard/compute/new" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: t.buttonRadius, textDecoration: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.925rem", boxShadow: t.shadow }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                Deploy machines
                            </Link>
                        )}
                    </div>
                ) : (
                    <>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ background: t.isMono ? t.bgSecondary : "rgba(255,255,255,0.015)" }}>
                                    {["Status", "Name", "IP Address", "Configuration", "Actions"].map(h => (
                                        <th key={h} style={{ padding: "11px 20px", textAlign: "left", fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}`, whiteSpace: "nowrap" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {instances.map((vm, idx) => {
                                    const st = getStatusColor(vm, t);
                                    const isRunning = st.label === "Running";
                                    const live = vm.liveData;
                                    const cpuPct = live?.cpu ? (live.cpu * 100).toFixed(1) : null;
                                    const memUsed = live?.memory ?? 0;
                                    const memMax = live?.maxmem ?? 0;

                                    return (
                                        <Fragment key={vm.id}>
                                            <tr
                                                style={{ borderBottom: idx < instances.length - 1 ? `1px solid ${t.borderSecondary}` : "none", transition: "background 0.12s" }}
                                                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = t.bgCardHover}
                                                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}
                                            >
                                                {/* Status */}
                                                <td style={{ padding: "16px 20px", width: 120 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, flexShrink: 0, boxShadow: isRunning && !t.isMono ? `0 0 8px ${st.color}` : "none" }} />
                                                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: st.color }}>{st.label}</span>
                                                    </div>
                                                    {isRunning && live && (
                                                        <div style={{ marginTop: 6 }}>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                                                <span style={{ fontSize: "0.62rem", color: t.textMuted, width: 24 }}>CPU</span>
                                                                <div style={{ flex: 1, height: 3, borderRadius: 2, background: t.borderPrimary }}>
                                                                    <div style={{ height: "100%", borderRadius: 2, background: t.accentPrimary, width: `${Math.min(100, parseFloat(cpuPct ?? "0"))}%` }} />
                                                                </div>
                                                                <span style={{ fontSize: "0.62rem", color: t.textMuted }}>{cpuPct}%</span>
                                                            </div>
                                                            {memMax > 0 && (
                                                                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                                                                    <span style={{ fontSize: "0.62rem", color: t.textMuted, width: 24 }}>RAM</span>
                                                                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: t.borderPrimary }}>
                                                                        <div style={{ height: "100%", borderRadius: 2, background: t.isMono ? t.accentPrimary : t.accentSecondary, width: `${Math.min(100, (memUsed / memMax) * 100)}%` }} />
                                                                    </div>
                                                                    <span style={{ fontSize: "0.62rem", color: t.textMuted }}>{formatBytes(memUsed)}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Name */}
                                                <td style={{ padding: "16px 20px" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                        <div style={{ width: 24, height: 24, borderRadius: t.isMono ? 4 : 5, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill={t.accentPrimary}><circle cx="12" cy="12" r="9" /></svg>
                                                        </div>
                                                        <div>
                                                            <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}`} style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem", textDecoration: "none" }}>
                                                                {vm.name}
                                                            </Link>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                                                                <span style={{ fontSize: "0.68rem", color: t.textMuted, fontFamily: t.fontMono }}>VM #{vm.vmId}</span>
                                                                <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: "0.62rem", fontWeight: 700, background: t.accentPrimaryMuted, color: t.accentPrimary }}>{osLabel(vm.os)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* IP */}
                                                <td style={{ padding: "16px 20px" }}>
                                                    {vm.ipAddress
                                                        ? <span style={{ fontFamily: t.fontMono, fontSize: "0.875rem", color: t.accentPrimary, fontWeight: 600 }}>{vm.ipAddress}</span>
                                                        : <span style={{ color: t.textMuted, fontSize: "0.875rem" }}>—</span>}
                                                </td>

                                                {/* Configuration */}
                                                <td style={{ padding: "16px 20px" }}>
                                                    <div style={{ fontSize: "0.8rem", color: t.textSecondary, fontFamily: t.fontMono }}>
                                                        {[vm.specs?.vcpu && `${vm.specs.vcpu} vCPU`, vm.specs?.ram_gb && `${vm.specs.ram_gb} GB RAM`, vm.specs?.disk_gb && `${vm.specs.disk_gb} GB SATA`].filter(Boolean).join(" · ") || "—"}
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
                                                        <span style={{ fontSize: "0.68rem", color: t.textMuted }}>{vm.node}</span>
                                                        {isRunning && live && (
                                                            <><span style={{ color: t.borderSecondary }}>·</span><span style={{ fontSize: "0.68rem", color: t.textMuted }}>↑ {formatUptime(live.uptime)}</span></>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Actions */}
                                                <td style={{ padding: "16px 20px" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        {isRunning ? (
                                                            <>
                                                                <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}&tab=console`} title="Console"
                                                                    style={{ width: 32, height: 32, borderRadius: t.isMono ? 4 : 7, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${t.accentPrimary}44`, background: t.accentPrimaryMuted, color: t.accentPrimary, textDecoration: "none" }}>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
                                                                </Link>
                                                                <button title="Restart" disabled={actionLoading === `${vm.vmId}-restart`} onClick={() => handleAction(vm.vmId, vm.node, "restart")}
                                                                    style={{ width: 32, height: 32, borderRadius: t.isMono ? 4 : 7, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
                                                                </button>
                                                                <button title="Stop" disabled={actionLoading === `${vm.vmId}-stop`} onClick={() => handleAction(vm.vmId, vm.node, "stop")}
                                                                    style={{ width: 32, height: 32, borderRadius: t.isMono ? 4 : 7, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button title="Start" disabled={actionLoading === `${vm.vmId}-start`} onClick={() => handleAction(vm.vmId, vm.node, "start")}
                                                                style={{ width: 32, height: 32, borderRadius: t.isMono ? 4 : 7, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                                            </button>
                                                        )}
                                                        <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}`} title="Settings"
                                                            style={{ width: 32, height: 32, borderRadius: t.isMono ? 4 : 7, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${t.borderPrimary}`, color: t.textMuted, textDecoration: "none" }}>
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" /></svg>
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        {renderPagination()}
                    </>
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
