"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { WINDOWS_ISOS, getIsosByCategory } from "@/lib/windows-isos";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { AlertTriangle, Play, X, Globe, Network } from "lucide-react";

interface VmDetail {
    id: string;
    vmId: string;
    node: string;
    name: string;
    os: string;
    status: string;
    displayType: string;
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

interface VpcAssignmentInfo {
    id: string;
    bridgeName: string;
    ipAddress: string | null;
    vpc: { id: string; name: string; vlanId: number; subnet: string; gateway: string; status: string };
}

export default function VmDetailPage({ params }: { params: Promise<{ vmId: string }> }) {
    const { vmId } = use(params);
    const searchParams = useSearchParams();
    const node = searchParams.get("node") || "";
    const initialTab = searchParams.get("tab") || "overview";
    const t = useThemeTokens();

    const [vm, setVm] = useState<VmDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState(initialTab);
    const [actionLoading, setActionLoading] = useState("");
    const [selectedIso, setSelectedIso] = useState<string>(WINDOWS_ISOS[0].id);
    const [error, setError] = useState("");
    const [vpcAssignments, setVpcAssignments] = useState<VpcAssignmentInfo[]>([]);

    const [showDestroy, setShowDestroy] = useState(false);
    const [destroyPwd, setDestroyPwd] = useState("");
    const [destroyLoading, setDestroyLoading] = useState(false);
    const [destroyErr, setDestroyErr] = useState("");

    const [displayType, setDisplayType] = useState<"novnc" | "spice">("novnc");
    const [displayLoading, setDisplayLoading] = useState(false);
    const [displayMsg, setDisplayMsg] = useState("");

    const loadVm = useCallback(async () => {
        try {
            const res = await fetch(`/api/proxmox/vms/${vmId}?node=${node}`);
            if (!res.ok) throw new Error("Failed to load VM");
            const data = await res.json() as VmDetail;
            setVm(data);
            if (data.displayType === "spice" || data.displayType === "novnc") setDisplayType(data.displayType);
        } catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
        finally { setLoading(false); }
    }, [vmId, node]);

    const loadVpcData = useCallback(async () => {
        try {
            const res = await fetch("/api/networks");
            if (res.ok) {
                const data = await res.json();
                const mine = (data.assignments ?? []).filter((a: VpcAssignmentInfo & { vpsInstance: { vmId: string } }) => a.vpsInstance?.vmId === vmId);
                setVpcAssignments(mine);
            }
        } catch { /* silent */ }
    }, [vmId]);

    useEffect(() => {
        loadVm();
        loadVpcData();
        const es = new EventSource(`/api/proxmox/vms/${vmId}/stream?node=${encodeURIComponent(node)}`);
        es.onmessage = (event: MessageEvent<string>) => { try { const liveData = JSON.parse(event.data) as VmDetail["liveData"]; setVm(prev => prev ? { ...prev, liveData } : prev); } catch { /* ignore */ } };
        es.onerror = () => {};
        return () => es.close();
    }, [vmId, node, loadVm, loadVpcData]);

    const handleAction = async (action: string, isoId?: string) => {
        setActionLoading(action); setError("");
        try {
            if (action === "reinstall") {
                const res = await fetch(`/api/proxmox/vms/${vmId}/reinstall`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ node, isoId }) });
                if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Reinstall failed"); }
                setTimeout(loadVm, 3000); return;
            }
            const res = await fetch(`/api/proxmox/vms/${vmId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, node, isoId }) });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Action failed"); }
            setTimeout(loadVm, 2000);
        } catch (err) { setError(err instanceof Error ? err.message : "Action failed"); }
        finally { setActionLoading(""); }
    };

    const handleDestroy = async (e: React.FormEvent) => {
        e.preventDefault(); setDestroyLoading(true); setDestroyErr("");
        try {
            const res = await fetch(`/api/proxmox/vms/${vmId}/destroy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: destroyPwd, node }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Destroy failed");
            window.location.href = "/dashboard/vps";
        } catch (err) { setDestroyErr(err instanceof Error ? err.message : "Failed"); setDestroyLoading(false); }
    };

    const handleDisplayChange = async (next: "novnc" | "spice") => {
        if (!vm || next === displayType) return;
        setDisplayLoading(true); setDisplayMsg("");
        try {
            const res = await fetch(`/api/proxmox/vms/${vm.vmId}/display`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayType: next, node: vm.node }) });
            const data = await res.json() as { error?: string };
            if (!res.ok) throw new Error(data.error ?? "Failed");
            setDisplayType(next); setDisplayMsg(`Display switched to ${next === "novnc" ? "noVNC" : "SPICE"} successfully.`);
        } catch (err) { setDisplayMsg(`Error: ${err instanceof Error ? err.message : "Failed"}`); }
        finally { setDisplayLoading(false); setTimeout(() => setDisplayMsg(""), 5000); }
    };

    const formatUptime = (s: number) => { if (!s) return "—"; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`; };
    const formatBytes = (b: number) => { if (!b) return "0 B"; if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`; if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`; if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`; return `${(b / 1e3).toFixed(0)} KB`; };

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow, padding: 24 };

    if (loading) return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: t.bgPrimary }}>
            <p style={{ color: t.textMuted }}>Loading VM details…</p>
        </div>
    );

    if (!vm) return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: t.bgPrimary }}>
            <div style={{ textAlign: "center" }}><h2 style={{ marginBottom: 12, color: t.textPrimary }}>VM Not Found</h2><Link href="/dashboard/vps" style={{ color: t.accentPrimary, textDecoration: "none", fontWeight: 600 }}>← Back to VPS</Link></div>
        </div>
    );

    const live = vm.liveData;
    const isRunning = (live?.status || vm.status) === "running";
    const cpuPercent = live?.cpu ? live.cpu * 100 : 0;
    const memUsed = live?.memory || 0, memTotal = live?.maxmem || 0, memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
    const diskUsed = live?.disk || 0, diskTotal = live?.maxdisk || 0, diskPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;
    const isoCategories = getIsosByCategory();

    const tabs = [
        { id: "overview", label: "Overview" },
        { id: "network", label: "Network" },
        { id: "console", label: "Console" },
        { id: "settings", label: "Settings" },
    ];

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>

            {/* Breadcrumb + Header */}
            <div style={{ marginBottom: 28 }}>
                <Link href="/dashboard/vps" style={{ color: t.textMuted, fontSize: "0.82rem", textDecoration: "none" }}>← Back to VPS Instances</Link>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: isRunning ? t.statusSuccess : t.statusError, boxShadow: isRunning && !t.isMono ? `0 0 10px ${t.statusSuccess}` : "none" }} />
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>{vm.name}</h1>
                            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                                <span style={{ fontSize: "0.78rem", color: t.textMuted, fontFamily: t.fontMono }}>VM {vm.vmId}</span>
                                <span style={{ color: t.textMuted }}>•</span>
                                <span style={{ fontSize: "0.78rem", color: t.textMuted }}>{vm.node}</span>
                                <span style={{ color: t.textMuted }}>•</span>
                                <span style={{ fontSize: "0.78rem", color: t.textSecondary }}>{vm.os}</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        {isRunning ? (
                            <>
                                <button title="Graceful reboot" onClick={() => handleAction("restart")} disabled={!!actionLoading} style={{ padding: "8px 16px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: t.bgCard, color: t.textSecondary, cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>{actionLoading === "restart" ? "…" : "Restart"}</button>
                                <button title="Hard reset (power-cycle)" onClick={() => { if (confirm("Hard reset will power-cycle the VM immediately (like the reset button). Continue?")) handleAction("reset"); }} disabled={!!actionLoading} style={{ padding: "8px 16px", borderRadius: t.buttonRadius, border: `1px solid ${t.statusWarning}`, background: "transparent", color: t.statusWarning, cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>{actionLoading === "reset" ? "…" : "Reset"}</button>
                                <button title="Hard power-off" onClick={() => handleAction("stop")} disabled={!!actionLoading} style={{ padding: "8px 16px", borderRadius: t.buttonRadius, border: "none", background: t.statusError, color: "#fff", cursor: "pointer", fontSize: "0.85rem", fontWeight: 700 }}>{actionLoading === "stop" ? "Stopping…" : "Stop"}</button>
                            </>
                        ) : (
                            <button onClick={() => handleAction("start")} disabled={!!actionLoading} style={{ padding: "8px 20px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, cursor: "pointer", fontSize: "0.85rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>{actionLoading === "start" ? "Starting..." : <><Play style={{ width: 12, height: 12 }} /> Start</>}</button>
                        )}
                    </div>
                </div>
            </div>

            {error && (
                <div style={{ padding: "12px 18px", borderRadius: t.cardRadius, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 20, fontSize: "0.88rem" }}>
                    {error} <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center" }}><X style={{ width: 14, height: 14 }} /></button>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${t.borderPrimary}` }}>
                {tabs.map(tt => (
                    <button key={tt.id} onClick={() => setTab(tt.id)} style={{
                        padding: "12px 20px", background: tab === tt.id ? t.accentPrimaryMuted : "transparent",
                        border: "none", borderBottom: tab === tt.id ? `2px solid ${t.accentPrimary}` : "2px solid transparent",
                        color: tab === tt.id ? t.accentPrimary : t.textMuted, cursor: "pointer", fontSize: "0.88rem", fontWeight: 600, transition: "all 0.2s",
                    }}>{tt.label}</button>
                ))}
            </div>

            {/* ─── Overview Tab ─── */}
            {tab === "overview" && (
                <div>
                    {/* Resource bars */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                        {[
                            { label: "CPU Usage", value: `${cpuPercent.toFixed(1)}%`, pct: cpuPercent, sub: `${vm.specs?.vcpu || "—"} vCPU Cores` },
                            { label: "Memory", value: formatBytes(memUsed), pct: memPercent, sub: `${formatBytes(memUsed)} / ${formatBytes(memTotal)}` },
                            { label: "Disk", value: formatBytes(diskUsed), pct: diskPercent, sub: `${formatBytes(diskUsed)} / ${formatBytes(diskTotal)}` },
                        ].map(r => (
                            <div key={r.label} style={card}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                                    <span style={{ color: t.textMuted, fontSize: "0.85rem", fontWeight: 600 }}>{r.label}</span>
                                    <span style={{ fontSize: "1.15rem", fontWeight: 700, color: t.accentPrimary, fontFamily: t.fontMono }}>{r.value}</span>
                                </div>
                                <div style={{ height: 6, borderRadius: 3, background: t.borderPrimary }}>
                                    <div style={{ height: "100%", borderRadius: 3, background: t.accentPrimary, width: `${Math.min(100, r.pct)}%`, transition: "width 0.5s" }} />
                                </div>
                                <p style={{ color: t.textMuted, fontSize: "0.75rem", marginTop: 8 }}>{r.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* Info grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div style={card}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 14, color: t.textSecondary }}>Instance Details</h3>
                            {[["Status", live?.status || vm.status], ["Uptime", isRunning ? formatUptime(live?.uptime || 0) : "—"], ["OS", vm.os], ["IP Address", vm.ipAddress || "Not assigned"], ["Node", vm.node], ["VM ID", vm.vmId]].map(([l, v]) => (
                                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${t.borderSecondary}`, fontSize: "0.88rem" }}>
                                    <span style={{ color: t.textMuted }}>{l}</span>
                                    <span style={{ color: t.textPrimary, fontWeight: 500, fontFamily: t.fontMono }}>{v}</span>
                                </div>
                            ))}
                        </div>
                        <div style={card}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 14, color: t.textSecondary }}>Hardware Specs</h3>
                            {[["vCPU", `${vm.specs?.vcpu || "—"} Cores`], ["RAM", `${vm.specs?.ram_gb || "—"} GB`], ["Disk", `${vm.specs?.disk_gb || "—"} GB SATA`], ["GPU", vm.specs?.gpu || "None"], ["Network In", formatBytes(live?.netin || 0)], ["Network Out", formatBytes(live?.netout || 0)]].map(([l, v]) => (
                                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${t.borderSecondary}`, fontSize: "0.88rem" }}>
                                    <span style={{ color: t.textMuted }}>{l}</span>
                                    <span style={{ color: t.textPrimary, fontWeight: 500, fontFamily: t.fontMono }}>{v}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Network Tab ─── */}
            {tab === "network" && (
                <div>
                    {vpcAssignments.length === 0 ? (
                        <div style={{ ...card, padding: "48px 24px", textAlign: "center" }}>
                            <div style={{ width: 52, height: 52, borderRadius: 14, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                                <Globe style={{ width: 26, height: 26, color: t.accentPrimary }} />
                            </div>
                            <p style={{ fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>No VPC Assignment</p>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted, maxWidth: 380, margin: "0 auto" }}>This VM is not assigned to any VPC network. Contact an administrator for VPC provisioning.</p>
                        </div>
                    ) : (
                        <div style={{ display: "grid", gap: 16 }}>
                            {vpcAssignments.map(a => (
                                <div key={a.id} style={card}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                                        <Network style={{ width: 18, height: 18, color: t.accentPrimary }} />
                                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "1rem" }}>{a.vpc.name}</span>
                                        <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: a.vpc.status === "ACTIVE" ? t.statusSuccessBg : t.statusErrorBg, color: a.vpc.status === "ACTIVE" ? t.statusSuccess : t.statusError }}>{a.vpc.status}</span>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: "0.85rem" }}>
                                        {[
                                            ["VLAN ID", String(a.vpc.vlanId)],
                                            ["Subnet", a.vpc.subnet],
                                            ["Gateway", a.vpc.gateway],
                                            ["Assigned IP", a.ipAddress || "DHCP"],
                                            ["Bridge", a.bridgeName],
                                        ].map(([l, v]) => (
                                            <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${t.borderSecondary}` }}>
                                                <span style={{ color: t.textMuted }}>{l}</span>
                                                <span style={{ color: t.accentPrimary, fontFamily: t.fontMono, fontWeight: 600 }}>{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Console Tab ─── */}
            {tab === "console" && (
                <div>
                    {isRunning ? (
                        <div style={{ ...card, textAlign: "center", padding: 40 }}>
                            <h3 style={{ marginBottom: 8, fontSize: "1.15rem", color: t.textPrimary }}>Remote Console</h3>
                            {displayType === "novnc" ? (
                                <>
                                    <p style={{ color: t.textMuted, fontSize: "0.88rem", marginBottom: 24, maxWidth: 480, margin: "0 auto 24px" }}>Connect to your VM directly in the browser using <strong style={{ color: t.textSecondary }}>noVNC</strong>.</p>
                                    <Link href={`/dashboard/vps/${vm.vmId}/console?node=${vm.node}`} style={{ display: "inline-block", padding: "12px 28px", borderRadius: t.buttonRadius, background: t.accentPrimary, color: t.textInverse, fontWeight: 700, textDecoration: "none" }}>Open noVNC Console</Link>
                                </>
                            ) : (
                                <>
                                    <p style={{ color: t.textMuted, fontSize: "0.88rem", marginBottom: 24, maxWidth: 480, margin: "0 auto 24px" }}>Download the SPICE connection file and open it with <strong style={{ color: t.textSecondary }}>virt-viewer</strong>.</p>
                                    <a href={`/api/proxmox/spice/download?vmId=${vm.vmId}&node=${vm.node}`} download style={{ display: "inline-block", padding: "12px 28px", borderRadius: t.buttonRadius, background: t.accentPrimary, color: t.textInverse, fontWeight: 700, textDecoration: "none" }}>Download SPICE Console (.vv)</a>
                                    <p style={{ color: t.textMuted, fontSize: "0.75rem", marginTop: 16 }}>Requires <a href="https://virt-manager.org/download/" target="_blank" rel="noopener noreferrer" style={{ color: t.accentPrimary }}>virt-viewer</a></p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div style={{ ...card, textAlign: "center", padding: 60 }}>
                            <h3 style={{ marginBottom: 8, color: t.textPrimary }}>VM is not running</h3>
                            <p style={{ color: t.textMuted, marginBottom: 20 }}>Start the VM to access the console.</p>
                            <button onClick={() => handleAction("start")} disabled={!!actionLoading} style={{ padding: "10px 24px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>{actionLoading === "start" ? "Starting..." : <><Play style={{ width: 13, height: 13 }} /> Start VM</>}</button>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Settings Tab ─── */}
            {tab === "settings" && (
                <div>
                    {/* Display Type */}
                    <div style={{ ...card, marginBottom: 20 }}>
                        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 4, color: t.textPrimary }}>Console Display Type</h3>
                        <p style={{ color: t.textMuted, fontSize: "0.85rem", marginBottom: 16 }}><strong>noVNC</strong> = browser-based. <strong>SPICE</strong> = external client (virt-viewer).</p>
                        {isRunning && (
                            <div style={{ padding: "12px 16px", borderRadius: t.cardRadius, background: t.statusWarningBg, border: `1px solid ${t.statusWarning}33`, color: t.statusWarning, fontSize: "0.85rem", fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                                <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} /> Power off the VM before changing the display adapter.
                            </div>
                        )}
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {(["novnc", "spice"] as const).map(opt => (
                                <label key={opt} style={{
                                    flex: 1, minWidth: 160, padding: "14px 18px", borderRadius: t.cardRadius,
                                    border: `1px solid ${displayType === opt ? t.accentPrimary : t.borderPrimary}`,
                                    background: displayType === opt ? t.accentPrimaryMuted : "transparent",
                                    cursor: isRunning || displayLoading ? "not-allowed" : "pointer",
                                    opacity: isRunning || displayLoading ? 0.55 : 1,
                                    display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s",
                                }}>
                                    <input type="radio" name="displayType" value={opt} checked={displayType === opt} disabled={isRunning || displayLoading} onChange={() => void handleDisplayChange(opt)} style={{ accentColor: t.accentPrimary }} />
                                    <div>
                                        <p style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 2, color: t.textPrimary }}>{opt === "novnc" ? "noVNC" : "SPICE"}</p>
                                        <p style={{ fontSize: "0.75rem", color: t.textMuted }}>{opt === "novnc" ? "Browser-based, no install" : "External client, best performance"}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                        {displayMsg && <p style={{ marginTop: 12, fontSize: "0.85rem", color: displayMsg.startsWith("Error") ? t.statusError : t.statusSuccess }}>{displayMsg}</p>}
                    </div>

                    {/* OS Reinstall */}
                    <div style={{ ...card, marginBottom: 20 }}>
                        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 8, color: t.textPrimary }}>Reinstall Operating System</h3>
                        <p style={{ color: t.textMuted, fontSize: "0.88rem", marginBottom: 20 }}>Select a Windows ISO. This will stop the VM, change the boot ISO, and restart it.<br /><strong style={{ color: t.statusError }}>Warning: This may erase all data on the VM.</strong></p>
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: 250 }}>
                                <label style={{ display: "block", fontSize: "0.82rem", color: t.textMuted, marginBottom: 6 }}>Windows Version</label>
                                <select value={selectedIso} onChange={e => setSelectedIso(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: t.cardRadius, background: t.bgInput, border: `1px solid ${t.borderPrimary}`, color: t.textPrimary, fontSize: "0.875rem", cursor: "pointer", outline: "none" }}>
                                    {Object.entries(isoCategories).map(([cat, isos]) => (
                                        <optgroup key={cat} label={cat}>{isos.map(iso => <option key={iso.id} value={iso.id}>{iso.name}</option>)}</optgroup>
                                    ))}
                                </select>
                            </div>
                            <button onClick={() => { if (confirm(`Reinstall with ${WINDOWS_ISOS.find(i => i.id === selectedIso)?.name}? This may erase all data.`)) handleAction("reinstall", selectedIso); }} disabled={!!actionLoading} style={{ padding: "10px 24px", borderRadius: t.buttonRadius, border: "none", background: t.statusError, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{actionLoading === "reinstall" ? "Reinstalling…" : "Reinstall"}</button>
                        </div>
                    </div>

                    {/* VM Info */}
                    <div style={{ ...card, marginBottom: 24 }}>
                        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 14, color: t.textPrimary }}>Instance Information</h3>
                        <div style={{ fontSize: "0.82rem", color: t.textMuted, padding: 16, background: t.bgSecondary, borderRadius: t.cardRadius, fontFamily: t.fontMono }}>
                            <div>Instance ID: {vm.id}</div>
                            <div>Proxmox VM ID: {vm.vmId}</div>
                            <div>Node: {vm.node}</div>
                            <div>Created: {new Date(vm.expiresAt || "").toLocaleDateString() || "—"}</div>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div>
                        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: t.statusError, marginBottom: 14 }}>Danger Zone</h3>
                        <div style={{ ...card, border: `1px solid ${t.statusError}44`, background: t.statusErrorBg }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
                                <div>
                                    <h4 style={{ fontWeight: 700, marginBottom: 4, color: t.textPrimary }}>Destroy Instance</h4>
                                    <p style={{ color: t.textMuted, fontSize: "0.85rem", maxWidth: 400 }}>Permanently delete this instance and all data. This action cannot be undone.</p>
                                </div>
                                <button onClick={() => setShowDestroy(true)} style={{ padding: "10px 24px", borderRadius: t.buttonRadius, border: "none", background: t.statusError, color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>Destroy Instance</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Destroy Modal */}
            {showDestroy && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: t.isLight ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                    <div style={{ ...card, width: "100%", maxWidth: 480, padding: 32, border: `1px solid ${t.statusError}55`, boxShadow: `0 10px 40px ${t.statusError}22` }}>
                        <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: t.textPrimary, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                            <AlertTriangle style={{ width: 20, height: 20, color: t.statusError }} /> Confirm Destruction
                        </h2>
                        <p style={{ color: t.textMuted, fontSize: "0.92rem", marginBottom: 24, lineHeight: 1.6 }}>
                            Are you absolutely sure you want to destroy <strong>{vm.name}</strong>? All data will be wiped permanently.
                        </p>
                        <form onSubmit={handleDestroy}>
                            <label style={{ display: "block", fontSize: "0.85rem", color: t.textSecondary, fontWeight: 600, marginBottom: 8 }}>Enter your account password to verify:</label>
                            <input type="password" required value={destroyPwd} onChange={e => setDestroyPwd(e.target.value)} placeholder="••••••••" style={{ width: "100%", marginBottom: 16, padding: "10px 12px", borderRadius: t.cardRadius, background: t.bgSecondary, border: `1px solid ${t.borderPrimary}`, color: t.textPrimary, fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }} />
                            {destroyErr && <p style={{ color: t.statusError, fontSize: "0.85rem", marginBottom: 16 }}>{destroyErr}</p>}
                            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                                <button type="button" onClick={() => { setShowDestroy(false); setDestroyPwd(""); setDestroyErr(""); }} disabled={destroyLoading} style={{ padding: "10px 20px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                                <button type="submit" disabled={destroyLoading || !destroyPwd} style={{ padding: "10px 24px", borderRadius: t.buttonRadius, border: "none", background: t.statusError, color: "#fff", fontWeight: 700, cursor: destroyLoading ? "not-allowed" : "pointer" }}>{destroyLoading ? "Destroying…" : "Confirm Destroy"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
