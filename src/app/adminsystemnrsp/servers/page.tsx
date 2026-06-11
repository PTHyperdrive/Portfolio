"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Server, Search, RefreshCw, X, ChevronLeft, ChevronRight } from "lucide-react";

interface VpsInstance {
    id: string; vmId: string; node: string; name: string;
    os: string; status: string; ipAddress: string | null;
    specs: { vcpu?: number; ram_gb?: number; disk_gb?: number } | null;
    createdAt: string;
    user: { id: string; name: string | null; email: string };
}
interface PageMeta { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean; }

const STATUS_COLOR = (status: string, t: ReturnType<typeof useThemeTokens>) =>
    status === "running" ? t.statusSuccess : status === "stopped" ? t.statusError : t.statusWarning;

function useDebounce<T>(v: T, ms: number) {
    const [d, setD] = useState(v);
    useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
    return d;
}

export default function AdminServersPage() {
    const t = useThemeTokens();
    const [instances, setInstances] = useState<VpsInstance[]>([]);
    const [meta, setMeta] = useState<PageMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [sort, setSort] = useState("createdAt_desc");
    const [page, setPage] = useState(1);
    const search = useDebounce(searchInput, 300);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => { setPage(1); }, [search, statusFilter, sort]);

    const load = useCallback(async () => {
        abortRef.current?.abort();
        const ctrl = new AbortController(); abortRef.current = ctrl;
        setLoading(true);
        try {
            const p = new URLSearchParams({ page: String(page), limit: "20", search, status: statusFilter, sort });
            const res = await fetch(`/api/admin/servers?${p}`, { signal: ctrl.signal });
            if (!res.ok) throw new Error("Failed");
            const data = await res.json();
            setInstances(data.instances ?? []);
            setMeta(data.meta ?? null);
        } catch (e) { if ((e as Error).name !== "AbortError") setInstances([]); }
        finally { setLoading(false); }
    }, [page, search, statusFilter, sort]);

    useEffect(() => { load(); }, [load]);

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const inp: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, color: t.textPrimary, fontSize: "0.84rem", outline: "none", padding: "7px 11px", fontFamily: t.fontFamily };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 4 }}>Admin System &bull; Server Management</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Server style={{ width: 20, height: 20, color: t.statusWarning }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>Server Management</h1>
                            <p style={{ fontSize: "0.82rem", color: t.textMuted }}>All virtual machines across all users.</p>
                        </div>
                    </div>
                    <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                        <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                    </button>
                </div>
            </div>

            {/* Summary chips */}
            {meta && (
                <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                    {[
                        { label: "Total VMs", val: meta.total, color: t.accentPrimary },
                        { label: "Running", val: instances.filter(i => i.status === "running").length, color: t.statusSuccess },
                        { label: "Stopped", val: instances.filter(i => i.status === "stopped").length, color: t.statusError },
                    ].map(chip => (
                        <div key={chip.label} style={{ padding: "6px 14px", borderRadius: t.cardRadius, background: t.bgCard, border: `1px solid ${t.borderPrimary}`, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: "0.72rem", color: t.textMuted, fontWeight: 600 }}>{chip.label}</span>
                            <span style={{ fontSize: "0.9rem", fontWeight: 800, color: chip.color }}>{chip.val}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Table card */}
            <div style={card}>
                {/* Toolbar */}
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ position: "relative", flex: "1 1 220px" }}>
                        <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: t.textMuted, pointerEvents: "none" }} />
                        <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search VM name, IP, owner, node…" style={{ ...inp, width: "100%", paddingLeft: 30, boxSizing: "border-box" as const }} />
                        {searchInput && <button onClick={() => setSearchInput("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t.textMuted, cursor: "pointer", display: "flex" }}><X style={{ width: 11, height: 11 }} /></button>}
                    </div>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                        <option value="">All Status</option>
                        <option value="running">Running</option>
                        <option value="stopped">Stopped</option>
                        <option value="paused">Paused</option>
                    </select>
                    <select value={sort} onChange={e => setSort(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                        <option value="createdAt_desc">Newest</option>
                        <option value="createdAt_asc">Oldest</option>
                        <option value="name_asc">Name A-Z</option>
                        <option value="status_asc">Status</option>
                    </select>
                </div>

                {/* Table */}
                {loading ? (
                    <div style={{ padding: "40px 0", textAlign: "center", color: t.textMuted }}>Loading servers...</div>
                ) : instances.length === 0 ? (
                    <div style={{ padding: "48px 24px", textAlign: "center", color: t.textMuted }}>No servers match the filter.</div>
                ) : (
                    <>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ background: t.bgSecondary }}>
                                    {["Status", "VM / OS", "Owner", "IP Address", "Specs", "Node", "Created"].map(h => (
                                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${t.borderSecondary}`, whiteSpace: "nowrap" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {instances.map((vm, idx) => {
                                    const sc = STATUS_COLOR(vm.status, t);
                                    return (
                                        <tr key={vm.id} style={{ borderBottom: idx < instances.length - 1 ? `1px solid ${t.borderSecondary}` : "none" }}
                                            onMouseEnter={e => (e.currentTarget.style.background = t.bgCardHover)}
                                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                            <td style={{ padding: "12px 16px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc }} />
                                                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: sc }}>{vm.status}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: "12px 16px" }}>
                                                <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.875rem" }}>{vm.name}</p>
                                                <p style={{ fontSize: "0.68rem", color: t.textMuted, fontFamily: t.fontMono }}>VM #{vm.vmId} &bull; {vm.os.split(" ")[0]}</p>
                                            </td>
                                            <td style={{ padding: "12px 16px" }}>
                                                <p style={{ fontSize: "0.82rem", color: t.textSecondary }}>{vm.user.name || vm.user.email}</p>
                                                <p style={{ fontSize: "0.68rem", color: t.textMuted }}>{vm.user.email}</p>
                                            </td>
                                            <td style={{ padding: "12px 16px", fontFamily: t.fontMono, fontSize: "0.82rem", color: t.accentPrimary }}>{vm.ipAddress || "—"}</td>
                                            <td style={{ padding: "12px 16px", fontFamily: t.fontMono, fontSize: "0.75rem", color: t.textSecondary }}>
                                                {vm.specs ? [vm.specs.vcpu && `${vm.specs.vcpu}C`, vm.specs.ram_gb && `${vm.specs.ram_gb}G`, vm.specs.disk_gb && `${vm.specs.disk_gb}GB`].filter(Boolean).join(" · ") : "—"}
                                            </td>
                                            <td style={{ padding: "12px 16px", fontSize: "0.78rem", color: t.textMuted, fontFamily: t.fontMono }}>{vm.node}</td>
                                            <td style={{ padding: "12px 16px", fontSize: "0.75rem", color: t.textMuted }}>{new Date(vm.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Pagination */}
                        {meta && meta.totalPages > 1 && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: `1px solid ${t.borderSecondary}` }}>
                                <span style={{ fontSize: "0.75rem", color: t.textMuted }}>
                                    {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
                                </span>
                                <div style={{ display: "flex", gap: 4 }}>
                                    <button disabled={!meta.hasPrevPage} onClick={() => setPage(p => p - 1)} style={{ width: 30, height: 30, borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: meta.hasPrevPage ? t.textSecondary : t.borderPrimary, cursor: meta.hasPrevPage ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <ChevronLeft style={{ width: 14, height: 14 }} />
                                    </button>
                                    <button disabled={!meta.hasNextPage} onClick={() => setPage(p => p + 1)} style={{ width: 30, height: 30, borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: meta.hasNextPage ? t.textSecondary : t.borderPrimary, cursor: meta.hasNextPage ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <ChevronRight style={{ width: 14, height: 14 }} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
