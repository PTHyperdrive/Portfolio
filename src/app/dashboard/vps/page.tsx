"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
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
    running: { color: "#10b981", label: "Running" },
    stopped: { color: "#ef4444", label: "Stopped" },
    paused:  { color: "#f59e0b", label: "Paused"  },
} as const;

function getStatus(vm: VpsInstance) {
    const raw = (vm.liveData?.status ?? vm.status) as keyof typeof STATUS_MAP;
    return STATUS_MAP[raw] ?? { color: "#64748b", label: raw };
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

function osColor(os: string) {
    const l = os.toLowerCase();
    if (l.includes("ubuntu"))  return "#e95420";
    if (l.includes("debian"))  return "#a80030";
    if (l.includes("centos") || l.includes("alma") || l.includes("rocky")) return "#262577";
    if (l.includes("windows")) return "#0078d4";
    return "#475569";
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

/** Custom debounce hook */
function useDebounce<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

// ── Small shared components ───────────────────────────────────────────────────

function ActionBtn({ title, disabled, onClick, children }: {
    title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
    const [hov, setHov] = useState(false);
    return (
        <button title={title} disabled={disabled} onClick={onClick}
            onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            style={{
                width: 32, height: 32, borderRadius: 7,
                border: "1px solid rgba(255,255,255,0.08)",
                background: hov ? "rgba(255,255,255,0.08)" : "transparent",
                color: disabled ? "#334155" : "#94a3b8",
                cursor: disabled ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s", flexShrink: 0,
            }}>
            {children}
        </button>
    );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", textAlign: "center", padding: "60px 40px" }}>
            <div style={{ marginBottom: 28, position: "relative" }}>
                <div style={{ width: 96, height: 96, borderRadius: 24, background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1))", border: "1px solid rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                    {hasFilters
                        ? <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                        : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /><circle cx="12" cy="10" r="2" /></svg>
                    }
                </div>
            </div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#f1f5f9", marginBottom: 10 }}>
                {hasFilters ? "No results found" : "No Virtual Machines yet"}
            </h2>
            <p style={{ fontSize: "0.875rem", color: "#64748b", maxWidth: 380, lineHeight: 1.6, marginBottom: 28 }}>
                {hasFilters
                    ? "Try adjusting your search or filter to find what you're looking for."
                    : "Spin up compute resources in minutes with one click."}
            </p>
            {hasFilters ? (
                <button onClick={onClear} style={{ padding: "10px 24px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}>
                    Clear filters
                </button>
            ) : (
                <Link href="/dashboard/compute/new" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 10, textDecoration: "none", background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontWeight: 700, fontSize: "0.925rem", boxShadow: "0 4px 20px rgba(59,130,246,0.35)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Deploy machines
                </Link>
            )}
        </div>
    );
}

// ── Pagination Bar ────────────────────────────────────────────────────────────

function PaginationBar({ meta, onPage }: { meta: PageMeta; onPage: (p: number) => void }) {
    if (meta.totalPages <= 1) return null;

    // Window of pages to show around current page
    const pages: (number | "…")[] = [];
    const cur = meta.page;
    const total = meta.totalPages;

    if (total <= 7) {
        for (let i = 1; i <= total; i++) pages.push(i);
    } else {
        pages.push(1);
        if (cur > 3) pages.push("…");
        for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) pages.push(i);
        if (cur < total - 2) pages.push("…");
        pages.push(total);
    }

    const btnStyle = (active: boolean, disabled?: boolean): React.CSSProperties => ({
        minWidth: 34, height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid",
        borderColor: active ? "#3b82f6" : "rgba(255,255,255,0.08)",
        background: active ? "rgba(59,130,246,0.15)" : "transparent",
        color: active ? "#60a5fa" : disabled ? "#1e293b" : "#64748b",
        fontWeight: active ? 700 : 500, fontSize: "0.82rem",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s",
    });

    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ fontSize: "0.78rem", color: "#475569" }}>
                Showing {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of <strong style={{ color: "#64748b" }}>{meta.total}</strong> instances
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {/* Prev */}
                <button disabled={!meta.hasPrevPage} onClick={() => onPage(meta.page - 1)} style={btnStyle(false, !meta.hasPrevPage)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                {/* Page numbers */}
                {pages.map((p, i) =>
                    p === "…"
                        ? <span key={`ellipsis-${i}`} style={{ color: "#334155", fontSize: "0.82rem", padding: "0 4px" }}>…</span>
                        : <button key={p} onClick={() => onPage(p as number)} style={btnStyle(p === cur)}>{p}</button>
                )}
                {/* Next */}
                <button disabled={!meta.hasNextPage} onClick={() => onPage(meta.page + 1)} style={btnStyle(false, !meta.hasNextPage)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6" /></svg>
                </button>
            </div>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function VpsDashboard() {
    const { data: session } = useSession();

    // ── Filter state ──────────────────────────────────────────────────
    const [searchInput, setSearchInput] = useState("");          // live input
    const [statusFilter, setStatusFilter] = useState("");        // "" | "running" | "stopped"
    const [sortKey, setSortKey] = useState("createdAt_desc");
    const [page, setPage] = useState(1);
    const LIMIT = 10;

    // Debounced search — 300ms after last keystroke
    const search = useDebounce(searchInput, 300);

    // ── Data state ────────────────────────────────────────────────────
    const [instances, setInstances] = useState<VpsInstance[]>([]);
    const [meta, setMeta] = useState<PageMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);

    const userMeta = session?.user as Record<string, unknown> | undefined;
    const hasUsedTrial = userMeta?.hasUsedTrial === true;

    // Reset to page 1 whenever filters change
    useEffect(() => { setPage(1); }, [search, statusFilter, sortKey]);

    // ── Fetch (server-side paginated) ─────────────────────────────────
    const fetchRef = useRef<AbortController | null>(null);

    const loadInstances = useCallback(async (silent = false) => {
        // Abort in-flight request if filters changed quickly
        fetchRef.current?.abort();
        const ctrl = new AbortController();
        fetchRef.current = ctrl;

        if (!silent) setLoading(true);

        try {
            const params = new URLSearchParams({
                page:   String(page),
                limit:  String(LIMIT),
                search,
                status: statusFilter,
                sort:   sortKey,
            });
            const res = await fetch(`/api/proxmox/vms?${params}`, { signal: ctrl.signal });
            if (!res.ok) throw new Error("Failed to load VMs");
            const data = await res.json();
            setInstances(data.instances ?? []);
            setMeta(data.meta ?? null);
            setError("");
        } catch (err: unknown) {
            if ((err as Error).name === "AbortError") return; // intentional cancel
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            if (!silent) setLoading(false);
        }
    }, [page, search, statusFilter, sortKey]);

    // Reload whenever deps change
    useEffect(() => { loadInstances(); }, [loadInstances]);

    // Background refresh every 15s (silent — no spinner)
    useEffect(() => {
        const iv = setInterval(() => loadInstances(true), 15_000);
        return () => clearInterval(iv);
    }, [loadInstances]);

    // Trial status
    useEffect(() => {
        if (!hasUsedTrial) return;
        fetch("/api/proxmox/check-trial")
            .then(r => r.json())
            .then(d => setTrialStatus(d.status ?? null))
            .catch(() => null);
    }, [hasUsedTrial]);

    const handleAction = async (vmId: string, node: string, action: string) => {
        setActionLoading(`${vmId}-${action}`);
        try {
            const res = await fetch(`/api/proxmox/vms/${vmId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, node }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Action failed"); }
            setTimeout(() => loadInstances(true), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed");
        } finally {
            setActionLoading(null);
        }
    };

    const clearFilters = () => {
        setSearchInput("");
        setStatusFilter("");
        setSortKey("createdAt_desc");
        setPage(1);
    };

    const hasFilters = !!(searchInput || statusFilter);

    // ── Render ─────────────────────────────────────────────────────────
    const bg = "#0d1117";
    const card: React.CSSProperties = { background: "#161b22", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14 };
    const inputStyle: React.CSSProperties = {
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 8, color: "#e2e8f0", fontSize: "0.85rem", outline: "none",
        padding: "8px 12px", transition: "border-color 0.15s",
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: bg }}>

            {/* ── Page Header ── */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
                <div>
                    <p style={{ fontSize: "0.78rem", color: "#475569", marginBottom: 6 }}>Dashboard &nbsp;•&nbsp; Virtual Machine</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f1f5f9" }}>Virtual Machines</h1>
                        {meta && meta.total > 0 && (
                            <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>{meta.total}</span>
                        )}
                    </div>
                </div>

                {/* Deploy button — shown when VMs exist */}
                {meta && meta.total > 0 && (
                    <Link href="/dashboard/compute/new" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 9, textDecoration: "none", background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontWeight: 700, fontSize: "0.875rem", boxShadow: "0 2px 12px rgba(59,130,246,0.3)", marginTop: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        Deploy New Server
                    </Link>
                )}
            </div>

            {/* ── Trial Banners ── */}
            {trialStatus?.isPastGrace && (
                <div style={{ padding: "14px 20px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>⚠️ Trial data permanently deleted (33-day limit exceeded).</span>
                    <Link href="/services/vps" style={{ padding: "6px 16px", borderRadius: 7, background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: "0.8rem", textDecoration: "none" }}>View Plans</Link>
                </div>
            )}
            {trialStatus?.isExpired && !trialStatus.isPastGrace && (
                <div style={{ padding: "14px 20px", borderRadius: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>⏰ <strong>Trial Expired.</strong> VM deletes in <strong>{trialStatus.daysUntilDeletion} day(s)</strong>.</span>
                    <Link href="/payment?plan=Cloud+Starter" style={{ padding: "6px 16px", borderRadius: 7, background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: "0.8rem", textDecoration: "none" }}>Upgrade Now</Link>
                </div>
            )}
            {trialStatus?.isActive && (
                <div style={{ padding: "12px 20px", borderRadius: 10, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", color: "#10b981", marginBottom: 20, fontSize: "0.85rem" }}>
                    ✅ Trial active — <strong>{trialStatus.daysRemaining} day(s)</strong> remaining.
                </div>
            )}

            {/* ── Error Banner ── */}
            {error && (
                <div style={{ padding: "12px 16px", borderRadius: 9, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", marginBottom: 20, fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}>
                    {error}
                    <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
                </div>
            )}

            {/* ── Main Card ── */}
            <div style={card}>

                {/* ── Toolbar: Search + Filters ── */}
                <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

                    {/* Search box */}
                    <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
                        <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                        </svg>
                        <input
                            id="vm-search"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder="Search by name, OS, IP, VM ID…"
                            style={{ ...inputStyle, width: "100%", paddingLeft: 32, boxSizing: "border-box" }}
                        />
                        {searchInput && (
                            <button onClick={() => setSearchInput("")}
                                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 2 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
                            </button>
                        )}
                    </div>

                    {/* Status filter */}
                    <select
                        id="vm-status-filter"
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        style={{ ...inputStyle, cursor: "pointer", paddingRight: 28 }}
                    >
                        <option value="">All Status</option>
                        <option value="running">🟢 Running</option>
                        <option value="stopped">🔴 Stopped</option>
                        <option value="paused">🟡 Paused</option>
                    </select>

                    {/* Sort */}
                    <select
                        id="vm-sort"
                        value={sortKey}
                        onChange={e => setSortKey(e.target.value)}
                        style={{ ...inputStyle, cursor: "pointer" }}
                    >
                        <option value="createdAt_desc">Newest first</option>
                        <option value="createdAt_asc">Oldest first</option>
                        <option value="name_asc">Name A→Z</option>
                        <option value="name_desc">Name Z→A</option>
                    </select>

                    {/* Clear filters */}
                    {hasFilters && (
                        <button onClick={clearFilters} style={{ ...inputStyle, cursor: "pointer", color: "#f59e0b", borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.07)", whiteSpace: "nowrap" }}>
                            ✕ Clear
                        </button>
                    )}

                    {/* Spacer + Refresh */}
                    <div style={{ flex: "0 0 auto", marginLeft: "auto" }}>
                        <button onClick={() => loadInstances()}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: "#64748b", fontSize: "0.8rem", cursor: "pointer" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                            </svg>
                            Refresh
                        </button>
                    </div>
                </div>

                {/* ── Loading skeleton ── */}
                {loading ? (
                    <div style={{ padding: "0 20px" }}>
                        {[...Array(3)].map((_, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
                                <div style={{ flex: 1, height: 14, borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />
                                <div style={{ width: 100, height: 14, borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />
                                <div style={{ width: 140, height: 14, borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />
                            </div>
                        ))}
                    </div>
                ) : instances.length === 0 ? (
                    /* ── Empty state ── */
                    <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
                ) : (
                    <>
                        {/* ── VM Table ── */}
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ background: "rgba(255,255,255,0.015)" }}>
                                    {["Status", "Name", "IP Address", "Configuration", "Actions"].map(h => (
                                        <th key={h} style={{ padding: "11px 20px", textAlign: "left", fontSize: "0.72rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{h}</th>
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
                                                style={{ borderBottom: idx < instances.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", transition: "background 0.12s" }}
                                                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.018)"}
                                                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}
                                            >
                                                {/* Status */}
                                                <td style={{ padding: "16px 20px", width: 120 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, flexShrink: 0, boxShadow: isRunning ? `0 0 8px ${st.color}` : "none" }} />
                                                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: st.color }}>{st.label}</span>
                                                    </div>
                                                    {isRunning && live && (
                                                        <div style={{ marginTop: 6 }}>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                                                <span style={{ fontSize: "0.62rem", color: "#475569", width: 24 }}>CPU</span>
                                                                <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                                                                    <div style={{ height: "100%", borderRadius: 2, background: "#3b82f6", width: `${Math.min(100, parseFloat(cpuPct ?? "0"))}%` }} />
                                                                </div>
                                                                <span style={{ fontSize: "0.62rem", color: "#64748b" }}>{cpuPct}%</span>
                                                            </div>
                                                            {memMax > 0 && (
                                                                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                                                                    <span style={{ fontSize: "0.62rem", color: "#475569", width: 24 }}>RAM</span>
                                                                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                                                                        <div style={{ height: "100%", borderRadius: 2, background: "#8b5cf6", width: `${Math.min(100, (memUsed / memMax) * 100)}%` }} />
                                                                    </div>
                                                                    <span style={{ fontSize: "0.62rem", color: "#64748b" }}>{formatBytes(memUsed)}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Name */}
                                                <td style={{ padding: "16px 20px" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                        <div style={{ width: 24, height: 24, borderRadius: 5, background: `${osColor(vm.os)}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill={osColor(vm.os)}><circle cx="12" cy="12" r="9" /></svg>
                                                        </div>
                                                        <div>
                                                            <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}`} style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.9rem", textDecoration: "none" }}>
                                                                {vm.name}
                                                            </Link>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                                                                <span style={{ fontSize: "0.68rem", color: "#475569", fontFamily: "monospace" }}>VM #{vm.vmId}</span>
                                                                <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: "0.62rem", fontWeight: 700, background: `${osColor(vm.os)}22`, color: osColor(vm.os) }}>{osLabel(vm.os)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* IP */}
                                                <td style={{ padding: "16px 20px" }}>
                                                    {vm.ipAddress
                                                        ? <span style={{ fontFamily: "monospace", fontSize: "0.875rem", color: "#38bdf8", fontWeight: 600 }}>{vm.ipAddress}</span>
                                                        : <span style={{ color: "#334155", fontSize: "0.875rem" }}>—</span>}
                                                </td>

                                                {/* Configuration */}
                                                <td style={{ padding: "16px 20px" }}>
                                                    <div style={{ fontSize: "0.8rem", color: "#94a3b8", fontFamily: "monospace" }}>
                                                        {[
                                                            vm.specs?.vcpu    && `${vm.specs.vcpu} vCPU`,
                                                            vm.specs?.ram_gb  && `${vm.specs.ram_gb} GB RAM`,
                                                            vm.specs?.disk_gb && `${vm.specs.disk_gb} GB SATA`,
                                                        ].filter(Boolean).join(" · ") || "—"}
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
                                                        <span style={{ fontSize: "0.68rem", color: "#475569" }}>{vm.node}</span>
                                                        {isRunning && live && (
                                                            <><span style={{ color: "#1e293b" }}>·</span><span style={{ fontSize: "0.68rem", color: "#475569" }}>↑ {formatUptime(live.uptime)}</span></>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Actions */}
                                                <td style={{ padding: "16px 20px" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        {isRunning ? (
                                                            <>
                                                                <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}&tab=console`} title="Console"
                                                                    style={{ width: 32, height: 32, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.1)", color: "#3b82f6", textDecoration: "none" }}>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
                                                                </Link>
                                                                <ActionBtn title="Restart" disabled={actionLoading === `${vm.vmId}-restart`} onClick={() => handleAction(vm.vmId, vm.node, "restart")}>
                                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
                                                                </ActionBtn>
                                                                <ActionBtn title="Stop" disabled={actionLoading === `${vm.vmId}-stop`} onClick={() => handleAction(vm.vmId, vm.node, "stop")}>
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                                                                </ActionBtn>
                                                            </>
                                                        ) : (
                                                            <ActionBtn title="Start" disabled={actionLoading === `${vm.vmId}-start`} onClick={() => handleAction(vm.vmId, vm.node, "start")}>
                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                                            </ActionBtn>
                                                        )}
                                                        <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}`} title="Settings"
                                                            style={{ width: 32, height: 32, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b", textDecoration: "none" }}>
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

                        {/* ── Pagination Bar ── */}
                        {meta && <PaginationBar meta={meta} onPage={setPage} />}
                    </>
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
