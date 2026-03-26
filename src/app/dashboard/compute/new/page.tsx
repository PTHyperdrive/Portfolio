"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Data ─────────────────────────────────────────────────────────────────────

const PLANS = [
    {
        id: "Nano-NAT", label: "Nano-NAT",
        badge: "Shared CPU", badgeColor: "#10b981",
        desc: "Best for hobby projects, bots, and lightweight workloads. Shared Xeon vCPU with local ZFS storage.",
        vcpu: 1, ram: 1, disk: 64, bw: "100 Mbps", price: 40_000,
    },
    {
        id: "Dev-Standard", label: "Dev-Standard",
        badge: "Balanced", badgeColor: "#3b82f6",
        desc: "Ideal for dev servers, staging, and medium-traffic apps. Dedicated ZFS storage.",
        vcpu: 2, ram: 4, disk: 80, bw: "250 Mbps", price: 120_000,
    },
    {
        id: "Perform-NVMe", label: "Perform-NVMe",
        badge: "NVMe SSD", badgeColor: "#8b5cf6",
        desc: "High IOPS NVMe storage for databases, CI/CD, and compute-heavy apps.",
        vcpu: 4, ram: 8, disk: 80, bw: "500 Mbps", price: 280_000,
    },
    {
        id: "GPU-Media", label: "GPU-Media",
        badge: "GPU Compute", badgeColor: "#f59e0b",
        desc: "GPU-accelerated instances for ML workloads, rendering, and media processing.",
        vcpu: 4, ram: 8, disk: 50, bw: "1 Gbps", price: 350_000,
    },
    {
        id: "GPU-Compute", label: "GPU-Compute",
        badge: "High Memory", badgeColor: "#ef4444",
        desc: "Large-memory GPU instance for deep learning, big data, and simulation.",
        vcpu: 8, ram: 16, disk: 150, bw: "1 Gbps", price: 850_000,
    },
] as const;

const LOCATIONS = [
    { id: "hcm1", label: "Ho Chi Minh 1", sub: "Vietnam", flag: "🇻🇳", node: "pve-hcm1" },
    { id: "hcm2", label: "Ho Chi Minh 2", sub: "Vietnam", flag: "🇻🇳", node: "pve-hcm2" },
];

const OS_OPTIONS = [
    { id: "ubuntu-24", label: "Ubuntu", version: "24.04 LTS", color: "#e95420" },
    { id: "ubuntu-22", label: "Ubuntu", version: "22.04 LTS", color: "#e95420" },
    { id: "debian-12", label: "Debian", version: "12 Bookworm", color: "#a80030" },
    { id: "alma-9",    label: "AlmaLinux", version: "9 x86_64",  color: "#1b4f72" },
    { id: "rocky-9",   label: "Rocky Linux", version: "9.3",     color: "#10b981" },
    { id: "centos-9",  label: "CentOS Stream", version: "9",     color: "#262577" },
    { id: "win-11",    label: "Windows", version: "11 23H2",      color: "#0078d4" },
    { id: "win-2022",  label: "Windows Server", version: "2022", color: "#0078d4" },
];

const BILLING_CYCLES = [
    { id: "hourly",   label: "Hourly",       badge: "Flexible", badgeColor: "#f59e0b",  mult: 0 },
    { id: "monthly",  label: "Monthly",      badge: null,        badgeColor: "",         mult: 1 },
    { id: "quarterly",label: "Quarterly",   badge: "-10%",       badgeColor: "#10b981",  mult: 2.7 },
    { id: "semi",     label: "Semiannually", badge: "-15%",      badgeColor: "#10b981",  mult: 5.1 },
    { id: "annually", label: "Annually",     badge: "-20%",      badgeColor: "#10b981",  mult: 9.6 },
];

const SW_TABS = ["Operating System", "Applications", "ISO", "Snapshot"];

// ── Small shared components ───────────────────────────────────────────────────

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {icon}
            </div>
            <div>
                <p style={{ fontWeight: 800, color: "#f1f5f9", fontSize: "0.975rem" }}>{title}</p>
                <p style={{ color: "#475569", fontSize: "0.78rem" }}>{sub}</p>
            </div>
        </div>
    );
}

function Check() {
    return (
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ComputeNewPage() {
    const router = useRouter();
    const [selectedPlan,    setSelectedPlan]    = useState("Dev-Standard");
    const [selectedLoc,     setSelectedLoc]     = useState("hcm1");
    const [swTab,           setSwTab]            = useState("Operating System");
    const [selectedOs,      setSelectedOs]      = useState("ubuntu-24");
    const [selectedCycle,   setSelectedCycle]   = useState("monthly");
    const [instanceCount,   setInstanceCount]   = useState(1);
    const [promoCode,       setPromoCode]       = useState("");
    const [promoApplied,    setPromoApplied]    = useState(false);
    const [promoBonus,      setPromoBonus]      = useState(0);
    const [promoErr,        setPromoErr]        = useState("");
    const [deploying,       setDeploying]       = useState(false);
    const [deployErr,       setDeployErr]       = useState("");
    const [backupEnabled,   setBackupEnabled]   = useState(false);

    const plan         = PLANS.find(p => p.id === selectedPlan)!;
    const location     = LOCATIONS.find(l => l.id === selectedLoc)!;
    const os           = OS_OPTIONS.find(o => o.id === selectedOs)!;
    const cycle        = BILLING_CYCLES.find(c => c.id === selectedCycle)!;
    const cycleMultiplier = cycle.mult === 0 ? (1 / 720) : cycle.mult; // hourly = price/720
    const basePrice    = cycle.id === "hourly"
        ? Math.round(plan.price / 720)
        : Math.round(plan.price * cycleMultiplier);
    const backupPrice  = backupEnabled ? 500 * plan.disk : 0;
    const total        = Math.max(0, (basePrice + backupPrice) * instanceCount - promoBonus);

    const cardBase: React.CSSProperties = {
        borderRadius: 12, border: "2px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.02)", padding: "16px 18px",
        cursor: "pointer", transition: "all 0.15s", position: "relative",
    };
    const cardActive: React.CSSProperties = {
        border: "2px solid #3b82f6", background: "rgba(59,130,246,0.08)",
    };
    const card: React.CSSProperties = { background: "#161b22", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14 };

    // Apply promo
    const applyPromo = async () => {
        if (!promoCode.trim() || promoApplied) return;
        try {
            const res = await fetch("/api/billing/promo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: promoCode }) });
            const d = await res.json();
            if (!res.ok) { setPromoErr(d.error ?? "Invalid code"); return; }
            setPromoApplied(true);
            setPromoBonus(d.creditsAdded);
            setPromoErr("");
        } catch { setPromoErr("Failed to apply code"); }
    };

    // Deploy
    const handleDeploy = async () => {
        setDeploying(true); setDeployErr("");
        try {
            const res = await fetch("/api/vps/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: selectedPlan, isoId: selectedOs, node: location.node }) });
            const d = await res.json();
            if (!res.ok) { setDeployErr(d.error ?? "Deployment failed"); return; }
            router.push("/dashboard/vps");
        } catch { setDeployErr("Unexpected error during deployment"); }
        finally { setDeploying(false); }
    };

    return (
        <div style={{ padding: "28px 36px", minHeight: "100vh", backgroundColor: "#0d1117" }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: "#475569", marginBottom: 6 }}>
                    Dashboard &nbsp;•&nbsp; <Link href="/dashboard/vps" style={{ color: "#475569", textDecoration: "none" }}>Virtual Machine</Link> &nbsp;•&nbsp; Deploy New Server
                </p>
                <h1 style={{ fontSize: "1.55rem", fontWeight: 800, color: "#f1f5f9" }}>Deploy New Server</h1>
            </div>

            {/* Two-column grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>

                {/* ══════════════════════════════════════════════════════════
                    LEFT COLUMN
                ══════════════════════════════════════════════════════════ */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* ── 1. Server Plan ── */}
                    <div style={{ ...card, padding: 24 }}>
                        <SectionHeader
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>}
                            title="Server Plan"
                            sub="Choose the hardware configuration for your instance"
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            {PLANS.map(p => {
                                const active = selectedPlan === p.id;
                                return (
                                    <div key={p.id} onClick={() => setSelectedPlan(p.id)}
                                        style={{ ...cardBase, ...(active ? cardActive : {}) }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                            <p style={{ fontWeight: 800, color: "#f1f5f9", fontSize: "0.925rem" }}>{p.label}</p>
                                            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: "0.65rem", fontWeight: 800, background: `${p.badgeColor}22`, color: p.badgeColor, whiteSpace: "nowrap" }}>{p.badge}</span>
                                        </div>
                                        <p style={{ fontSize: "0.75rem", color: "#64748b", lineHeight: 1.5, marginBottom: 10 }}>{p.desc}</p>
                                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                                            {[`${p.vcpu} vCPU`, `${p.ram} GB RAM`, `${p.disk} GB`, p.bw].map(s => (
                                                <span key={s} style={{ fontSize: "0.72rem", color: "#94a3b8", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 6 }}>{s}</span>
                                            ))}
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ fontWeight: 800, color: "#f1f5f9", fontSize: "0.9rem" }}>
                                                {p.price.toLocaleString()} <span style={{ fontSize: "0.72rem", color: "#475569", fontWeight: 500 }}>Credits/mo</span>
                                            </span>
                                            {active && <Check />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── 2. Location ── */}
                    <div style={{ ...card, padding: 24 }}>
                        <SectionHeader
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>}
                            title="Location"
                            sub="Choose the datacenter closest to your users"
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            {LOCATIONS.map(loc => {
                                const active = selectedLoc === loc.id;
                                return (
                                    <div key={loc.id} onClick={() => setSelectedLoc(loc.id)}
                                        style={{ ...cardBase, ...(active ? cardActive : {}), display: "flex", alignItems: "center", gap: 14 }}>
                                        <span style={{ fontSize: "1.8rem" }}>{loc.flag}</span>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.875rem" }}>{loc.label}</p>
                                            <p style={{ color: "#64748b", fontSize: "0.75rem" }}>{loc.sub}</p>
                                        </div>
                                        {active && <Check />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── 3. Software ── */}
                    <div style={{ ...card, padding: 24 }}>
                        <SectionHeader
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>}
                            title="Software"
                            sub="Select the operating system or application stack"
                        />

                        {/* Tabs */}
                        <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.07)", paddingBottom: 0 }}>
                            {SW_TABS.map(tab => (
                                <button key={tab} onClick={() => setSwTab(tab)} style={{
                                    padding: "7px 14px", borderRadius: "8px 8px 0 0",
                                    border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
                                    background: swTab === tab ? "rgba(59,130,246,0.12)" : "transparent",
                                    color: swTab === tab ? "#3b82f6" : "#64748b",
                                    borderBottom: swTab === tab ? "2px solid #3b82f6" : "2px solid transparent",
                                    transition: "all 0.15s",
                                }}>{tab}</button>
                            ))}
                        </div>

                        {/* OS Grid */}
                        {swTab === "Operating System" && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                {OS_OPTIONS.map(o => {
                                    const active = selectedOs === o.id;
                                    return (
                                        <div key={o.id} onClick={() => setSelectedOs(o.id)}
                                            style={{ ...cardBase, ...(active ? cardActive : {}), display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${o.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill={o.color}><circle cx="12" cy="12" r="9" opacity="0.8" /></svg>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.825rem" }}>{o.label}</p>
                                                <p style={{ color: "#64748b", fontSize: "0.72rem" }}>{o.version}</p>
                                            </div>
                                            {active ? <Check /> : (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {swTab !== "Operating System" && (
                            <div style={{ padding: "32px 0", textAlign: "center", color: "#334155", fontSize: "0.85rem" }}>
                                {swTab === "Applications" ? "Application marketplace coming soon." : swTab === "ISO" ? "Custom ISO upload coming soon." : "Snapshot restore coming soon."}
                            </div>
                        )}

                        {/* SSH Keys */}
                        <div style={{ marginTop: 20 }}>
                            <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>SSH Keys</p>
                            <div style={{ padding: "12px 16px", borderRadius: 9, background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.15)", fontSize: "0.825rem", color: "#7dd3fc", lineHeight: 1.6 }}>
                                You do not have any SSH keys yet. You can add your SSH key{" "}
                                <Link href="/dashboard/ssh-keys" style={{ color: "#38bdf8", fontWeight: 700, textDecoration: "underline" }}>here</Link>.
                            </div>
                        </div>
                    </div>

                    {/* ── 4. Packages (Prebuilt / Custom) ── */}
                    <div style={{ ...card, padding: 24 }}>
                        <SectionHeader
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></svg>}
                            title="Prebuilt Packages"
                            sub="Select a pre-configured resource package"
                        />
                        {/* Table rows */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
                            {/* Header */}
                            <div style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr .8fr .8fr 1fr 1.1fr 28px", gap: 0, padding: "8px 16px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                {["Package", "vCPU", "RAM", "Disk", "Bandwidth", "Price", ""].map(h => (
                                    <span key={h} style={{ fontSize: "0.68rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</span>
                                ))}
                            </div>
                            {PLANS.map((p, i) => {
                                const active = selectedPlan === p.id;
                                return (
                                    <div key={p.id} onClick={() => setSelectedPlan(p.id)}
                                        style={{
                                            display: "grid", gridTemplateColumns: "1.4fr .8fr .8fr .8fr 1fr 1.1fr 28px",
                                            alignItems: "center", padding: "12px 16px", cursor: "pointer",
                                            borderBottom: i < PLANS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                                            background: active ? "rgba(59,130,246,0.07)" : "transparent",
                                            borderLeft: active ? "2px solid #3b82f6" : "2px solid transparent",
                                            transition: "all 0.12s",
                                        }}
                                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"; }}
                                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                                    >
                                        <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.875rem" }}>{p.label}</span>
                                        <span style={{ fontSize: "0.82rem", color: "#94a3b8", fontFamily: "monospace" }}>{p.vcpu}</span>
                                        <span style={{ fontSize: "0.82rem", color: "#94a3b8", fontFamily: "monospace" }}>{p.ram} GB</span>
                                        <span style={{ fontSize: "0.82rem", color: "#94a3b8", fontFamily: "monospace" }}>{p.disk} GB</span>
                                        <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>{p.bw}</span>
                                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f1f5f9" }}>
                                            {p.price.toLocaleString()}{" "}
                                            <span style={{ fontSize: "0.65rem", color: "#475569", fontWeight: 400 }}>Credits/mo</span>
                                        </span>
                                        {active ? <Check /> : <div style={{ width: 20, height: 20 }} />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── 5. Payment Cycle ── */}
                    <div style={{ ...card, padding: 24 }}>
                        <SectionHeader
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
                            title="Payment Cycle"
                            sub="Save more with longer commitments"
                        />
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                            {BILLING_CYCLES.map(c => {
                                const active = selectedCycle === c.id;
                                return (
                                    <button key={c.id} onClick={() => setSelectedCycle(c.id)} style={{
                                        display: "flex", alignItems: "center", gap: 8,
                                        padding: "9px 16px", borderRadius: 9, cursor: "pointer",
                                        border: active ? "2px solid #3b82f6" : "2px solid rgba(255,255,255,0.08)",
                                        background: active ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.02)",
                                        color: active ? "#e2e8f0" : "#64748b",
                                        fontWeight: active ? 700 : 500, fontSize: "0.85rem", transition: "all 0.15s",
                                    }}>
                                        {c.label}
                                        {c.badge && (
                                            <span style={{ padding: "1px 7px", borderRadius: 20, fontSize: "0.65rem", fontWeight: 800, background: `${c.badgeColor}22`, color: c.badgeColor }}>
                                                {c.badge}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── 6. Add-ons ── */}
                    <div style={{ ...card, padding: 24 }}>
                        <SectionHeader
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>}
                            title="Additional Features"
                            sub="Optional add-ons for your instance"
                        />
                        {/* Automatic Backup */}
                        <div
                            onClick={() => setBackupEnabled(b => !b)}
                            style={{
                                display: "flex", alignItems: "center", gap: 16,
                                padding: "16px 18px", borderRadius: 10, cursor: "pointer",
                                border: backupEnabled ? "2px solid #10b981" : "2px solid rgba(255,255,255,0.07)",
                                background: backupEnabled ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.02)",
                                transition: "all 0.15s",
                            }}
                        >
                            <div style={{ width: 40, height: 40, borderRadius: 9, background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><polyline points="8 17 12 21 16 17" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" /></svg>
                            </div>
                            <div style={{ flex: 1 }}>
                                <p style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.9rem", marginBottom: 3 }}>Automatic Backup</p>
                                <p style={{ color: "#64748b", fontSize: "0.78rem" }}>Daily encrypted snapshots. Restore in one click.</p>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#10b981" }}>+500 Credits/GB</span>
                                <p style={{ color: "#475569", fontSize: "0.72rem", marginTop: 2 }}>≈ +{(500 * plan.disk).toLocaleString()} Credits/mo</p>
                            </div>
                            {backupEnabled ? <Check /> : <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)" }} />}
                        </div>
                    </div>
                </div>

                {/* ══════════════════════════════════════════════════════════
                    RIGHT COLUMN — Sticky Order Summary
                ══════════════════════════════════════════════════════════ */}
                <div style={{ ...card, padding: 24, position: "sticky", top: 24 }}>
                    {/* Summary Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg>
                        <p style={{ fontWeight: 800, color: "#f1f5f9", fontSize: "1rem" }}>Order Summary</p>
                    </div>

                    {/* Selected Config Block */}
                    <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 18 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 7, background: "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /></svg>
                            </div>
                            <div>
                                <p style={{ fontWeight: 800, color: "#f1f5f9", fontSize: "0.875rem" }}>{plan.label}</p>
                                <p style={{ color: "#64748b", fontSize: "0.72rem" }}>{plan.vcpu} vCPU · {plan.ram} GB RAM · {plan.disk} GB Disk · {plan.bw}</p>
                            </div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: "0.68rem", background: "rgba(255,255,255,0.05)", color: "#94a3b8" }}>
                                {location.flag} {location.label}
                            </span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: "0.68rem", background: "rgba(255,255,255,0.05)", color: "#94a3b8" }}>
                                {os.label} {os.version}
                            </span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: "0.68rem", background: "rgba(16,185,129,0.1)", color: "#10b981" }}>IPv4: Yes</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: "0.68rem", background: "rgba(255,255,255,0.04)", color: "#475569" }}>IPv6: No</span>
                        </div>
                    </div>

                    {/* Line items */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Base price ({cycle.label})</span>
                            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>{basePrice.toLocaleString()} Cr</span>
                        </div>
                        {backupEnabled && (
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Automatic Backup</span>
                                <span style={{ fontSize: "0.8rem", color: "#10b981", fontWeight: 600 }}>+{backupPrice.toLocaleString()} Cr</span>
                            </div>
                        )}
                        {instanceCount > 1 && (
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>× {instanceCount} instances</span>
                                <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}> </span>
                            </div>
                        )}
                        {promoApplied && (
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "0.8rem", color: "#10b981" }}>🎉 Promo bonus</span>
                                <span style={{ fontSize: "0.8rem", color: "#10b981", fontWeight: 700 }}>-{promoBonus.toLocaleString()} Cr</span>
                            </div>
                        )}
                    </div>

                    {/* Divider + Total */}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16, marginBottom: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                            <span style={{ fontSize: "0.72rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</span>
                            <span style={{ fontWeight: 900, fontSize: "1.45rem", color: "#f1f5f9" }}>
                                {total.toLocaleString()}
                            </span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: "0.75rem", color: "#475569" }}>Credits / {cycle.id === "hourly" ? "hour" : cycle.id === "monthly" ? "month" : cycle.label.toLowerCase()}</span>
                        </div>
                    </div>

                    {/* Promo Code */}
                    <div style={{ marginBottom: 18 }}>
                        <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#f59e0b" }}>🏷</span> Promo Code
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                value={promoCode}
                                onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoErr(""); }}
                                disabled={promoApplied}
                                placeholder="Enter promo code here 🎫"
                                style={{
                                    flex: 1, padding: "8px 12px",
                                    background: promoApplied ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.04)",
                                    border: `1px solid ${promoApplied ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.09)"}`,
                                    borderRadius: 8, color: "#e2e8f0", fontSize: "0.8rem", outline: "none",
                                    fontFamily: "monospace",
                                }}
                            />
                            <button onClick={applyPromo} disabled={promoApplied || !promoCode.trim()}
                                style={{
                                    width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                                    background: promoApplied ? "#10b981" : "#3b82f6",
                                    border: "none", cursor: "pointer", flexShrink: 0,
                                    opacity: !promoCode.trim() ? 0.5 : 1,
                                }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>
                            </button>
                        </div>
                        {promoErr && <p style={{ fontSize: "0.72rem", color: "#ef4444", marginTop: 6 }}>⚠ {promoErr}</p>}
                        {promoApplied && <p style={{ fontSize: "0.72rem", color: "#10b981", marginTop: 6 }}>🎉 +{promoBonus.toLocaleString()} credits applied</p>}
                    </div>

                    {/* Instance Count */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, padding: "10px 14px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>Instance Count</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <button onClick={() => setInstanceCount(c => Math.max(1, c - 1))} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                            <span style={{ fontWeight: 800, color: "#f1f5f9", minWidth: 20, textAlign: "center" }}>{instanceCount}</span>
                            <button onClick={() => setInstanceCount(c => Math.min(10, c + 1))} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        </div>
                    </div>

                    {/* Error */}
                    {deployErr && (
                        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: "0.8rem", marginBottom: 14 }}>
                            ⚠ {deployErr}
                        </div>
                    )}

                    {/* Deploy Button */}
                    <button onClick={handleDeploy} disabled={deploying} style={{
                        width: "100%", padding: "13px 0", borderRadius: 10,
                        background: deploying ? "#1d4ed8" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                        color: "#fff", fontWeight: 800, fontSize: "0.95rem",
                        border: "none", cursor: deploying ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        boxShadow: "0 4px 20px rgba(59,130,246,0.35)",
                        transition: "all 0.15s",
                    }}>
                        {deploying ? (
                            <>
                                <svg width="16" height="16" style={{ animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /></svg>
                                Deploying…
                            </>
                        ) : (
                            <>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                                Deploy Now
                            </>
                        )}
                    </button>
                    <p style={{ fontSize: "0.68rem", color: "#334155", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
                        Credits deducted immediately upon deployment.
                    </p>
                </div>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
