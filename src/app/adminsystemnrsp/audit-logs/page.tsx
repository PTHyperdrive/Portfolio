"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { ScrollText, Search, ChevronDown, ChevronLeft, ChevronRight, ArrowUpDown, Filter, X } from "lucide-react";

interface LogEntry {
    id: string; action: string; resourceType: string; outcome: string;
    ipAddress: string | null; userAgent: string | null;
    metadata: Record<string, unknown> | null; createdAt: string;
    user: { email: string; name: string | null };
}

const PAGE_SIZE = 25;

/**
 * All AuditAction enum values grouped by category for the filter dropdown.
 * Keep in sync with prisma/schema.prisma → enum AuditAction.
 */
const ACTION_GROUPS: Record<string, string[]> = {
    "Auth": [
        "LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT", "ACCOUNT_CREATED",
        "TFA_ENABLED", "TFA_DISABLED", "TFA_RECOVERY_GENERATED",
        "TFA_RECOVERY_USED", "TFA_RECOVERY_LOCKED", "TFA_LOCKOUT_TICKET",
        "PASSWORD_CHANGED", "SESSION_REVOKED",
    ],
    "VM Lifecycle": [
        "VM_CREATE", "VM_START", "VM_STOP", "VM_REBOOT", "VM_DESTROY",
        "VM_REINSTALL", "VM_DISPLAY_CHANGE", "VM_GPU_ALLOCATE", "VM_GPU_RELEASE",
    ],
    "Console": ["CONSOLE_VNC_ACCESS", "CONSOLE_SPICE_ACCESS"],
    "Billing": ["CREDIT_TOPUP", "CREDIT_DEDUCTION", "PROMO_APPLIED", "PLAN_ACTIVATED", "STORAGE_PURCHASE"],
    "Orchestration": ["SNAPSHOT_CREATE", "SNAPSHOT_DELETE", "SNAPSHOT_ROLLBACK", "BACKUP_CREATE"],
    "Admin": [
        "ADMIN_USER_MODIFY", "ADMIN_VM_ASSIGN", "ADMIN_VM_MODIFY",
        "ADMIN_PASSWORD_RESET", "ADMIN_USER_DELETE", "ADMIN_PRICING_CHANGE",
    ],
    "Data": ["DATA_EXPORT", "DATA_DELETION_REQUEST", "USER_ANONYMIZED"],
    "Security": ["SSH_KEY_ADD", "SSH_KEY_REMOVE"],
    "Crypto": ["CRYPTO_TOPUP_INITIATED", "CRYPTO_TOPUP_COMPLETED"],
    "Invites": ["INVITE_CODE_GENERATED", "INVITE_CODE_REDEEMED", "INVITE_PERMISSION_CHANGED"],
    "Chat": ["ADMIN_CHAT_CLOSED", "ADMIN_PIN_RESET", "ADMIN_CHAT_KEY_SETUP", "USER_CHAT_PIN_RESET"],
    "Network": ["VPC_CREATE", "VPC_DELETE", "VPC_ASSIGN_VM", "VPC_UNASSIGN_VM"],
    "WireGuard": ["WG_PEER_CREATE", "WG_PEER_REVOKE"],
    "Misc": ["REDIRECT_TO_PLANS", "TRIGGER_UPSELL_FLOW"],
};

const OUTCOME_OPTIONS = ["SUCCESS", "DENIED", "FAILED"];

function fmtDate(s: string) {
    return new Date(s).toLocaleString("en-US", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function BlurredIP({ ip, color }: { ip: string | null; color: string }) {
    if (!ip) return <span style={{ color }}>—</span>;
    return <span className="blurred-ip" title="Hover to reveal" style={{ fontFamily: "monospace", fontSize: "0.82rem", color, filter: "blur(4px)", transition: "filter 0.2s", cursor: "pointer", userSelect: "none" }}>{ip}</span>;
}

export default function AdminAuditLogsPage() {
    const t = useThemeTokens();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);

    // Server-side filters
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [actionFilter, setActionFilter] = useState("");
    const [outcomeFilter, setOutcomeFilter] = useState("");
    const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
    const [showActionDropdown, setShowActionDropdown] = useState(false);
    const actionDropdownRef = useRef<HTMLDivElement>(null);

    // Debounce search — 400ms delay to reduce API calls
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 400);
        return () => clearTimeout(timer);
    }, [search]);

    // Close action dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (actionDropdownRef.current && !actionDropdownRef.current.contains(e.target as Node)) {
                setShowActionDropdown(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const load = useCallback(async (p: number) => {
        setLoading(true); setError("");
        try {
            const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE), sort: sortDir });
            if (debouncedSearch) params.set("search", debouncedSearch);
            if (actionFilter)   params.set("action", actionFilter);
            if (outcomeFilter)  params.set("outcome", outcomeFilter);

            const res = await fetch(`/api/admin/logs?${params}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setLogs(data.logs ?? []);
            setTotal(data.total ?? 0);
            setTotalPages(data.totalPages ?? 0);
            setPage(p);
        } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
        finally { setLoading(false); }
    }, [debouncedSearch, actionFilter, outcomeFilter, sortDir]);

    // Reload on filter/search/sort change — reset to page 1
    useEffect(() => { load(1); }, [load]);

    const statusColor = (s: string) =>
        s === "SUCCESS" ? { bg: `${t.statusSuccess}22`, color: t.statusSuccess, dot: t.statusSuccess }
        : s === "DENIED" ? { bg: `${t.statusWarning}22`, color: t.statusWarning, dot: t.statusWarning }
        : { bg: `${t.statusError}22`, color: t.statusError, dot: t.statusError };

    const resourceColor = (s: string): string => {
        const map: Record<string, string> = { VirtualMachine: t.accentPrimary, UserAccount: t.accentSecondary, Billing: t.statusWarning, Network: t.statusSuccess };
        return map[s] ?? t.textMuted;
    };

    const clearFilters = () => { setSearch(""); setActionFilter(""); setOutcomeFilter(""); setSortDir("desc"); };
    const hasFilters = !!search || !!actionFilter || !!outcomeFilter || sortDir !== "desc";

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow, overflow: "hidden" };
    const chipStyle = (active: boolean): React.CSSProperties => ({
        padding: "5px 12px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 600,
        border: `1px solid ${active ? t.accentPrimary : t.borderPrimary}`,
        background: active ? `${t.accentPrimary}14` : "transparent",
        color: active ? t.accentPrimary : t.textSecondary,
        cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" as const,
    });

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <style>{`.blurred-ip:hover { filter: blur(0px) !important; user-select: text !important; }`}</style>

            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 4 }}>Admin System &bull; Audit Logs</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ScrollText style={{ width: 20, height: 20, color: t.statusWarning }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>Audit Logs</h1>
                        <p style={{ fontSize: "0.82rem", color: t.textMuted }}>Immutable record of all platform actions across all users.</p>
                    </div>
                </div>
            </div>

            <div style={card}>
                {/* ── Toolbar: Search + Filters ────────────────────────── */}
                <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Row 1: Search + total */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ position: "relative", flex: 1, maxWidth: 420 }}>
                            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: t.textMuted, pointerEvents: "none" }} />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by action, user, IP, resource…"
                                style={{ width: "100%", padding: "8px 12px 8px 30px", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, color: t.textPrimary, fontSize: "0.84rem", outline: "none", boxSizing: "border-box", fontFamily: t.fontFamily }}
                            />
                        </div>
                        <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: t.textMuted, whiteSpace: "nowrap" }}>
                            {total.toLocaleString()} entries
                        </span>
                    </div>

                    {/* Row 2: Filter chips */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Filter style={{ width: 13, height: 13, color: t.textMuted, flexShrink: 0 }} />

                        {/* Action filter dropdown */}
                        <div ref={actionDropdownRef} style={{ position: "relative" }}>
                            <button
                                onClick={() => setShowActionDropdown(v => !v)}
                                style={{ ...chipStyle(!!actionFilter), display: "inline-flex", alignItems: "center", gap: 4 }}
                            >
                                {actionFilter ? actionFilter.replace(/_/g, " ") : "All Actions"}
                                <ChevronDown style={{ width: 11, height: 11, transform: showActionDropdown ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                            </button>

                            {showActionDropdown && (
                                <div style={{
                                    position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
                                    width: 280, maxHeight: 360, overflowY: "auto",
                                    background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
                                    borderRadius: t.cardRadius, boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                                }}>
                                    {/* "All" option */}
                                    <button
                                        onClick={() => { setActionFilter(""); setShowActionDropdown(false); }}
                                        style={{
                                            width: "100%", padding: "8px 14px", border: "none",
                                            background: !actionFilter ? t.accentPrimaryMuted : "transparent",
                                            color: !actionFilter ? t.accentPrimary : t.textSecondary,
                                            fontSize: "0.8rem", fontWeight: 600, textAlign: "left", cursor: "pointer",
                                            borderBottom: `1px solid ${t.borderSecondary}`,
                                        }}
                                    >
                                        All Actions
                                    </button>

                                    {Object.entries(ACTION_GROUPS).map(([group, actions]) => (
                                        <div key={group}>
                                            <div style={{ padding: "8px 14px 4px", fontSize: "0.65rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                                {group}
                                            </div>
                                            {actions.map(a => (
                                                <button
                                                    key={a}
                                                    onClick={() => { setActionFilter(a); setShowActionDropdown(false); }}
                                                    style={{
                                                        width: "100%", padding: "6px 14px 6px 22px", border: "none",
                                                        background: actionFilter === a ? t.accentPrimaryMuted : "transparent",
                                                        color: actionFilter === a ? t.accentPrimary : t.textSecondary,
                                                        fontSize: "0.78rem", textAlign: "left", cursor: "pointer",
                                                        fontFamily: t.fontMono,
                                                    }}
                                                    onMouseEnter={e => { if (actionFilter !== a) e.currentTarget.style.background = t.bgCardHover; }}
                                                    onMouseLeave={e => { if (actionFilter !== a) e.currentTarget.style.background = "transparent"; }}
                                                >
                                                    {a.replace(/_/g, " ")}
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Outcome chips */}
                        {OUTCOME_OPTIONS.map(o => (
                            <button key={o} onClick={() => setOutcomeFilter(outcomeFilter === o ? "" : o)} style={chipStyle(outcomeFilter === o)}>
                                {o}
                            </button>
                        ))}

                        {/* Sort toggle */}
                        <button
                            onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
                            style={{ ...chipStyle(sortDir === "asc"), display: "inline-flex", alignItems: "center", gap: 4 }}
                            title={`Sort: ${sortDir === "desc" ? "Newest first" : "Oldest first"}`}
                        >
                            <ArrowUpDown style={{ width: 11, height: 11 }} />
                            {sortDir === "desc" ? "Newest" : "Oldest"}
                        </button>

                        {/* Clear all */}
                        {hasFilters && (
                            <button onClick={clearFilters} style={{ ...chipStyle(false), display: "inline-flex", alignItems: "center", gap: 4, color: t.statusError, borderColor: `${t.statusError}44` }}>
                                <X style={{ width: 10, height: 10 }} /> Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Error ─────────────────────────────────────────────── */}
                {error && <div style={{ margin: 16, padding: "10px 14px", background: t.statusErrorBg, borderRadius: t.cardRadius, color: t.statusError, fontSize: "0.84rem" }}>{error}</div>}

                {/* ── Table ─────────────────────────────────────────────── */}
                {loading ? (
                    <div style={{ padding: 60, textAlign: "center", color: t.textMuted }}>Loading audit log...</div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: t.bgSecondary }}>
                                {["Action", "Resource", "User", "Timestamp", "Outcome", ""].map(h => (
                                    <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}` }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: "48px", textAlign: "center", color: t.textMuted }}>
                                    {hasFilters ? "No entries match your filters." : "No entries recorded yet."}
                                </td></tr>
                            ) : logs.map(log => {
                                const sc = statusColor(log.outcome);
                                const svc = resourceColor(log.resourceType);
                                const isOpen = expanded === log.id;
                                return (
                                    <Fragment key={log.id}>
                                        <tr onClick={() => setExpanded(isOpen ? null : log.id)} style={{ borderBottom: `1px solid ${t.borderSecondary}`, cursor: "pointer", background: isOpen ? t.accentPrimaryMuted : "transparent" }}
                                            onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = t.bgCardHover; }}
                                            onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}>
                                            <td style={{ padding: "12px 18px" }}>
                                                <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.875rem" }}>{log.action.replace(/_/g, " ")}</p>
                                                <p style={{ color: t.textMuted, fontSize: "0.68rem", fontFamily: t.fontMono }}>{log.id.substring(0, 20)}…</p>
                                            </td>
                                            <td style={{ padding: "12px 18px" }}><span style={{ fontWeight: 700, color: svc, fontSize: "0.84rem" }}>{log.resourceType}</span></td>
                                            <td style={{ padding: "12px 18px" }}>
                                                <p style={{ color: t.textPrimary, fontSize: "0.84rem" }}>{log.user.name || log.user.email}</p>
                                                <BlurredIP ip={log.ipAddress} color={t.textMuted} />
                                            </td>
                                            <td style={{ padding: "12px 18px", color: t.textSecondary, fontSize: "0.82rem" }}>{fmtDate(log.createdAt)}</td>
                                            <td style={{ padding: "12px 18px" }}>
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: sc.bg, color: sc.color, fontSize: "0.72rem", fontWeight: 700 }}>
                                                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc.dot }} /> {log.outcome}
                                                </span>
                                            </td>
                                            <td style={{ padding: "12px 14px", color: t.textMuted }}>
                                                <ChevronDown style={{ width: 14, height: 14, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr>
                                                <td colSpan={6} style={{ padding: "0 18px 14px", background: t.accentPrimaryMuted }}>
                                                    <div style={{ padding: 16, background: t.bgSecondary, borderRadius: t.cardRadius, border: `1px solid ${t.borderSecondary}` }}>
                                                        <p style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Detail</p>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 10 }}>
                                                            <div><span style={{ display: "block", fontSize: "0.65rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>IP Address</span><BlurredIP ip={log.ipAddress} color={t.textPrimary} /></div>
                                                            <div><span style={{ display: "block", fontSize: "0.65rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>User Agent</span><span style={{ fontSize: "0.78rem", color: t.textSecondary, wordBreak: "break-all", lineHeight: 1.5 }}>{log.userAgent || "N/A"}</span></div>
                                                        </div>
                                                        {log.metadata && (
                                                            <pre style={{ padding: 12, background: t.bgTertiary, borderRadius: t.cardRadius, fontSize: "0.75rem", color: t.textSecondary, overflowX: "auto", fontFamily: t.fontMono }}>{JSON.stringify(log.metadata, null, 2)}</pre>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* ── Pagination ────────────────────────────────────────── */}
                {totalPages > 1 && (
                    <div style={{ padding: "12px 20px", borderTop: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.75rem", color: t.textMuted }}>
                            {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}
                        </span>

                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {/* First page */}
                            <button disabled={page <= 1} onClick={() => load(1)}
                                style={{ display: "flex", alignItems: "center", padding: "5px 8px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: page <= 1 ? t.textMuted : t.textSecondary, cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: "0.72rem", fontWeight: 600 }}>
                                1
                            </button>

                            {/* Previous */}
                            <button disabled={page <= 1} onClick={() => load(page - 1)}
                                style={{ display: "flex", alignItems: "center", padding: "5px 10px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: page <= 1 ? t.textMuted : t.textSecondary, cursor: page <= 1 ? "not-allowed" : "pointer" }}>
                                <ChevronLeft style={{ width: 14, height: 14 }} />
                            </button>

                            {/* Page indicator */}
                            <span style={{ padding: "5px 12px", fontSize: "0.78rem", fontWeight: 700, color: t.accentPrimary, fontFamily: t.fontMono }}>
                                {page} / {totalPages}
                            </span>

                            {/* Next */}
                            <button disabled={page >= totalPages} onClick={() => load(page + 1)}
                                style={{ display: "flex", alignItems: "center", padding: "5px 10px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: page >= totalPages ? t.textMuted : t.textSecondary, cursor: page >= totalPages ? "not-allowed" : "pointer" }}>
                                <ChevronRight style={{ width: 14, height: 14 }} />
                            </button>

                            {/* Last page */}
                            <button disabled={page >= totalPages} onClick={() => load(totalPages)}
                                style={{ display: "flex", alignItems: "center", padding: "5px 8px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: page >= totalPages ? t.textMuted : t.textSecondary, cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: "0.72rem", fontWeight: 600 }}>
                                {totalPages}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
