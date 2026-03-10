"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

// ─── VPS Plans (shown to logged-out visitors) ──────────────────

const VPS_PLANS = [
    {
        name: "Trial Plan",
        badge: "VPS",
        price: "Free 30 Days",
        specs: { CPU: "2 vCPU Cores", RAM: "2 GB DDR4", Storage: "32GB Sata SSD", Bandwidth: "45Mbit/s", GPU: "N/A" },
        features: ["24/7 Operation", "Limited Network", "Dedicated Manager", "Customized Config"],
        featured: false,
        color: "var(--accent-purple)",
    },
    {
        name: "Cloud Starter",
        badge: "VPS",
        price: 4.99,
        period: "/month",
        specs: { CPU: "2 vCPU Cores", RAM: "4 GB DDR4", Storage: "80 GB NVMe SSD", Bandwidth: "100Mbit/s", GPU: "N/A" },
        features: ["Private Network", "DDoS Protection", "SIEM ready", "24/7 Monitoring", "Service ready"],
        featured: false,
        color: "var(--accent-cyan)",
    },
    {
        name: "Cloud Gaming",
        badge: "VPS",
        price: 5.99,
        period: "/month",
        specs: { CPU: "8 vCPU Cores", RAM: "16 GB DDR4", Storage: "256GB SSD + 512GB HDD", Bandwidth: "1Gbit/s", GPU: "AMD or NVIDIA" },
        features: ["Tailscale Supported", "Account Protection", "Parsec & Sunshine ready", "Always up to date"],
        featured: false,
        color: "var(--accent-cyan)",
    },
    {
        name: "Cloud Workstation",
        badge: "DEDICATED GPU",
        price: 49.99,
        period: "/hour",
        specs: { CPU: "8 vCPU Cores", RAM: "32 GB DDR4", Storage: "500 GB NVMe SSD", Bandwidth: "10 TB", GPU: "AMD RX580 2048P" },
        features: ["DirectML Support", "PCIe Passthrough", "Priority Support", "Auto-Scaling", "File 3-2-1 Backup system", "Hourly Snapshots", "Full workstation applications supports"],
        featured: true,
        color: "var(--accent-magenta)",
    },
    {
        name: "Enterprise",
        badge: "V-GPU",
        price: 149.99,
        period: "/month",
        specs: { CPU: "32 vCPU Cores", RAM: "128 GB DDR4 ECC", Storage: "2 TB NVMe SSD", Bandwidth: "Unmetered", GPU: "NVIDIA RTX 6000" },
        features: ["Multi-GPU Cluster", "Dedicated Static IP", "Dedicated SDN", "CUDA & Tensor Supported", "Customized Config", "A.I Optimized"],
        featured: false,
        color: "var(--accent-purple)",
    },
    {
        name: "Anti-Detect VPS",
        badge: "Specialized",
        price: "Negotiable",
        specs: { CPU: "32 vCPU Cores", RAM: "64 GB DDR4 ECC", Storage: "256 U.2 SSD", Bandwidth: "Unmetered", GPU: "Optional" },
        features: ["VM full control", "Allow VM present obfuscation", "Dedicated custom network", "Customized CPU instructions", "Heavily customized VM", "Wireshark capturing supported"],
        featured: false,
        color: "var(--accent-cyan)",
    },
];

// ─── Types ──────────────────────────────────────────────────────

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
    user?: { name: string | null; email: string };
    liveData?: {
        status: string;
        uptime: number;
        cpu: number;
        memory: number;
        maxmem: number;
    };
}

// ─── Main Page Component ────────────────────────────────────────

export default function VPSPage() {
    const { data: session, status } = useSession();

    if (status === "loading") {
        return (
            <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                    <div className="animate-glow" style={{ width: 48, height: 48, borderRadius: "12px", background: "var(--gradient-primary)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>⚡</div>
                    <p style={{ color: "var(--text-muted)" }}>Loading...</p>
                </div>
            </div>
        );
    }

    if (status === "authenticated") {
        const isAdmin = (session?.user as any)?.role === "ADMIN";
        return <VpsManager isAdmin={isAdmin} />;
    }

    return <VpsPlans />;
}

// ─── Plans View (Logged Out) ────────────────────────────────────

function VpsPlans() {
    return (
        <>
            <section style={{ paddingTop: "140px", paddingBottom: "80px", position: "relative" }}>
                <div style={{ position: "absolute", top: 0, right: 0, width: "600px", height: "600px", background: "radial-gradient(circle, rgba(0,240,255,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
                <div className="container">
                    <span className="badge badge-cyan" style={{ marginBottom: "16px", display: "inline-block" }}>VPS HOSTING</span>
                    <h1 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "16px", maxWidth: "700px" }}>
                        Virtual Private Servers <br />
                        <span className="gradient-text">with GPU Power</span>
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", maxWidth: "600px", lineHeight: 1.7 }}>
                        From lightweight v-GPU instances to multi-GPU enterprise clusters.
                    </p>
                </div>
            </section>
            <section className="section" style={{ paddingTop: "20px" }}>
                <div className="container">
                    <div className="grid-3 stagger">
                        {VPS_PLANS.map((plan) => (
                            <div key={plan.name} className={`glass-card pricing-card ${plan.featured ? "featured" : ""}`} style={{ padding: "36px", display: "flex", flexDirection: "column" }}>
                                <span className="badge" style={{ background: `${plan.color}15`, color: plan.color, marginBottom: "16px", alignSelf: "flex-start" }}>{plan.badge}</span>
                                <h3 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "8px" }}>{plan.name}</h3>
                                <div style={{ marginBottom: "24px" }}>
                                    <span style={{ fontSize: "2.5rem", fontWeight: 800 }}><span className="gradient-text">${plan.price}</span></span>
                                    <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{plan.period}</span>
                                </div>
                                <div style={{ marginBottom: "24px" }}>
                                    {Object.entries(plan.specs).map(([key, value]) => (
                                        <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.9rem" }}>
                                            <span style={{ color: "var(--text-muted)" }}>{key}</span>
                                            <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: "0.85rem" }}>{value}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginBottom: "28px", flex: 1 }}>
                                    {plan.features.filter(Boolean).map((f) => (
                                        <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                                            <span style={{ color: plan.color, fontSize: "0.9rem" }}>✓</span>
                                            <span style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>{f}</span>
                                        </div>
                                    ))}
                                </div>
                                <Link href="/auth/register" className={plan.featured ? "btn btn-primary" : "btn btn-secondary"} style={{ width: "100%", textAlign: "center" }}>
                                    Get Started
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
            <section className="section" style={{ background: "rgba(255,255,255,0.01)" }}>
                <div className="container">
                    <h2 style={{ fontSize: "2rem", fontWeight: 800, textAlign: "center", marginBottom: "50px" }}>
                        Technical <span className="gradient-text">Specifications</span>
                    </h2>
                    <div className="grid-3 stagger">
                        {[
                            { icon: "💻", title: "AMD EPYC & Intel Xeon", desc: "Latest gen processors with up to 64 cores per node" },
                            { icon: "🎮", title: "NVIDIA Data Center GPUs", desc: "RTX6000, RTX2060, RTX4000 full CUDA & Tensor Core support" },
                            { icon: "💾", title: "NVMe SSD RAID", desc: "Enterprise NVMe SSDs in ZFS RAID-10 for speed and redundancy" },
                            { icon: "🌐", title: "10 Gbps Network", desc: "Low-latency network with global peering and DDoS mitigation" },
                            { icon: "🔄", title: "Instant Provisioning", desc: "Servers deployed in under 60 seconds with your chosen OS" },
                            { icon: "🛡️", title: "Secure Hypervisor", desc: "KVM-based isolation with hardware-level security" },
                        ].map((item) => (
                            <div key={item.title} className="glass-card" style={{ padding: "28px", textAlign: "center" }}>
                                <div style={{ fontSize: "2rem", marginBottom: "12px" }}>{item.icon}</div>
                                <h4 style={{ fontWeight: 700, marginBottom: "8px", fontSize: "1rem" }}>{item.title}</h4>
                                <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </>
    );
}

// ─── Create VM Modal (Admin Only) ───────────────────────────────

function CreateVMModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [form, setForm] = useState({
        node: "",
        name: "",
        cores: 2,
        memory: 2048,
        diskSize: 32,
        diskStorage: "local-lvm",
        iso: "",
        osLabel: "",
        ostype: "other",
        bios: "seabios",
        network: "virtio,bridge=vmbr0",
        assignUserId: "",
    });
    const [nodes, setNodes] = useState<any[]>([]);
    const [isos, setIsos] = useState<any[]>([]);
    const [storages, setStorages] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Load nodes + users on mount
    useEffect(() => {
        fetch("/api/admin/vms?action=nodes").then(r => r.json()).then(d => setNodes(d.nodes || [])).catch(() => { });
        fetch("/api/admin/vms").then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => { });
    }, []);

    // Load storages & ISOs when node changes
    useEffect(() => {
        if (!form.node) return;
        fetch(`/api/admin/vms?action=storages&node=${form.node}`).then(r => r.json()).then(d => setStorages(d.storages || [])).catch(() => { });
        fetch(`/api/admin/vms?action=isos&node=${form.node}`).then(r => r.json()).then(d => setIsos(d.isos || [])).catch(() => { });
    }, [form.node]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setError("");
        setSuccess("");
        try {
            const res = await fetch("/api/admin/vms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setSuccess(data.message || "VM created!");
            setTimeout(() => {
                onCreated();
                onClose();
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
        } finally {
            setCreating(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.04)", color: "var(--text-primary)", fontSize: "0.88rem", outline: "none",
    };
    const labelStyle: React.CSSProperties = { fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px", display: "block" };

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onClick={onClose}>
            <div
                style={{ background: "rgba(15,15,20,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "32px", width: "560px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 30px 60px rgba(0,0,0,0.7)" }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                    <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>
                        ➕ Create <span className="gradient-text">VM</span>
                    </h2>
                    <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
                </div>

                {error && <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(255,0,110,0.1)", border: "1px solid rgba(255,0,110,0.2)", color: "var(--accent-magenta)", marginBottom: "16px", fontSize: "0.85rem" }}>{error}</div>}
                {success && <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.2)", color: "var(--accent-green)", marginBottom: "16px", fontSize: "0.85rem" }}>{success}</div>}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* Node */}
                    <div>
                        <label style={labelStyle}>Proxmox Node *</label>
                        <select style={inputStyle} value={form.node} onChange={e => setForm({ ...form, node: e.target.value })} required>
                            <option value="">Select node...</option>
                            {nodes.map((n: any) => <option key={n.node} value={n.node}>{n.node} ({n.status})</option>)}
                        </select>
                    </div>

                    {/* Name */}
                    <div>
                        <label style={labelStyle}>VM Name *</label>
                        <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. client-win11-001" required />
                    </div>

                    {/* CPU + RAM row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                            <label style={labelStyle}>CPU Cores *</label>
                            <input type="number" style={inputStyle} value={form.cores} onChange={e => setForm({ ...form, cores: parseInt(e.target.value) || 1 })} min={1} max={128} required />
                        </div>
                        <div>
                            <label style={labelStyle}>RAM (MB) *</label>
                            <input type="number" style={inputStyle} value={form.memory} onChange={e => setForm({ ...form, memory: parseInt(e.target.value) || 512 })} min={512} step={512} required />
                        </div>
                    </div>

                    {/* Storage + Disk row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                            <label style={labelStyle}>Disk Storage</label>
                            <select style={inputStyle} value={form.diskStorage} onChange={e => setForm({ ...form, diskStorage: e.target.value })}>
                                <option value="local-lvm">local-lvm</option>
                                {storages.map((s: any) => <option key={s.storage} value={s.storage}>{s.storage} ({s.type})</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Disk Size (GB)</label>
                            <input type="number" style={inputStyle} value={form.diskSize} onChange={e => setForm({ ...form, diskSize: parseInt(e.target.value) || 8 })} min={8} />
                        </div>
                    </div>

                    {/* ISO */}
                    <div>
                        <label style={labelStyle}>Installation ISO</label>
                        <select style={inputStyle} value={form.iso} onChange={e => setForm({ ...form, iso: e.target.value })}>
                            <option value="">None (no CD)</option>
                            {isos.map((iso: any) => <option key={iso.volid} value={iso.volid}>{iso.volid}</option>)}
                        </select>
                    </div>

                    {/* OS Type + BIOS row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                            <label style={labelStyle}>OS Type</label>
                            <select style={inputStyle} value={form.ostype} onChange={e => setForm({ ...form, ostype: e.target.value })}>
                                <option value="other">Other</option>
                                <option value="l26">Linux 2.6+</option>
                                <option value="win11">Windows 11</option>
                                <option value="win10">Windows 10</option>
                                <option value="win7">Windows 7</option>
                                <option value="solaris">Solaris</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>BIOS</label>
                            <select style={inputStyle} value={form.bios} onChange={e => setForm({ ...form, bios: e.target.value })}>
                                <option value="seabios">SeaBIOS (Legacy)</option>
                                <option value="ovmf">OVMF (UEFI)</option>
                            </select>
                        </div>
                    </div>

                    {/* OS Label */}
                    <div>
                        <label style={labelStyle}>OS Display Label</label>
                        <input style={inputStyle} value={form.osLabel} onChange={e => setForm({ ...form, osLabel: e.target.value })} placeholder="e.g. Windows 11 Pro 24H2" />
                    </div>

                    {/* Network */}
                    <div>
                        <label style={labelStyle}>Network</label>
                        <input style={inputStyle} value={form.network} onChange={e => setForm({ ...form, network: e.target.value })} placeholder="virtio,bridge=vmbr0" />
                    </div>

                    {/* Assign to User */}
                    <div>
                        <label style={labelStyle}>Assign to User</label>
                        <select style={inputStyle} value={form.assignUserId} onChange={e => setForm({ ...form, assignUserId: e.target.value })}>
                            <option value="">Assign to myself (admin)</option>
                            {users.map((u: any) => <option key={u.id} value={u.id}>{u.email} {u.name ? `(${u.name})` : ""}</option>)}
                        </select>
                    </div>

                    {/* Submit */}
                    <button type="submit" disabled={creating} className="btn btn-primary" style={{ width: "100%", marginTop: "8px", padding: "12px", fontSize: "0.92rem" }}>
                        {creating ? "Creating VM..." : "🚀 Create VM on Proxmox"}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ─── VPS Manager View (Logged In) ──────────────────────────────

function VpsManager({ isAdmin }: { isAdmin: boolean }) {
    const [instances, setInstances] = useState<VpsInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);

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
                            VPS <span className="gradient-text">{isAdmin ? "Admin Manager" : "Manager"}</span>
                        </h1>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                            {isAdmin ? "Manage all virtual private servers across users" : "Manage your virtual private servers"}
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        {isAdmin && (
                            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary" style={{ padding: "8px 20px", fontSize: "0.85rem" }}>
                                ➕ Create VM
                            </button>
                        )}
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
                            {isAdmin ? "No VMs provisioned yet. Click \"Create VM\" to get started." : "You don't have any VPS instances yet."}
                        </p>
                        {isAdmin && (
                            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
                                ➕ Create VM
                            </button>
                        )}
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
                                        <div style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
                                            {/* Status + Name */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                                                <div style={{
                                                    width: 12, height: 12, borderRadius: "50%",
                                                    background: statusColor(live?.status || vm.status),
                                                    boxShadow: isRunning ? `0 0 12px ${statusColor("running")}` : "none",
                                                    animation: isRunning ? "glowPulse 2s ease-in-out infinite" : "none",
                                                }} />
                                                <div>
                                                    <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}`} style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", textDecoration: "none" }}>
                                                        {vm.name}
                                                    </Link>
                                                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                                                        <span className="mono" style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>VM {vm.vmId}</span>
                                                        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>•</span>
                                                        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{vm.node}</span>
                                                        {isAdmin && vm.user && (
                                                            <>
                                                                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>•</span>
                                                                <span style={{ fontSize: "0.78rem", color: "var(--accent-purple)" }}>👤 {vm.user.name || vm.user.email}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Specs */}
                                            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                                                {vm.specs?.vcpu && <div style={{ fontSize: "0.82rem" }}><span style={{ color: "var(--text-muted)" }}>CPU </span><span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{vm.specs.vcpu} vCPU</span></div>}
                                                {vm.specs?.ram_gb && <div style={{ fontSize: "0.82rem" }}><span style={{ color: "var(--text-muted)" }}>RAM </span><span className="mono" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{vm.specs.ram_gb} GB</span></div>}
                                                {vm.ipAddress && <div style={{ fontSize: "0.82rem" }}><span style={{ color: "var(--text-muted)" }}>IP </span><span className="mono" style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>{vm.ipAddress}</span></div>}
                                                <div style={{ fontSize: "0.82rem" }}><span style={{ color: "var(--text-muted)" }}>OS </span><span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{vm.os}</span></div>
                                            </div>

                                            {/* Live Stats */}
                                            {isRunning && live && (
                                                <div style={{ display: "flex", gap: "16px" }}>
                                                    <div style={{ width: "100px" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "4px" }}><span>CPU</span><span className="mono">{cpuPercent}%</span></div>
                                                        <div style={{ height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.06)" }}><div style={{ height: "100%", borderRadius: "2px", background: "var(--accent-cyan)", width: `${Math.min(100, parseFloat(cpuPercent))}%`, transition: "width 0.3s" }} /></div>
                                                    </div>
                                                    <div style={{ width: "100px" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "4px" }}><span>RAM</span><span className="mono">{formatBytes(memUsed)}</span></div>
                                                        <div style={{ height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.06)" }}><div style={{ height: "100%", borderRadius: "2px", background: "var(--accent-purple)", width: `${Math.min(100, parseFloat(memPercent))}%`, transition: "width 0.3s" }} /></div>
                                                    </div>
                                                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>⏱ {formatUptime(live.uptime)}</div>
                                                </div>
                                            )}

                                            {!isRunning && (
                                                <span className="badge" style={{ background: `${statusColor(vm.status)}15`, color: statusColor(vm.status), textTransform: "capitalize" }}>
                                                    {live?.status || vm.status}
                                                </span>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                            {isRunning ? (
                                                <>
                                                    <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}&tab=console`} className="btn btn-primary" style={{ padding: "8px 16px", fontSize: "0.8rem" }}>🖥 Console</Link>
                                                    <button onClick={() => handleAction(vm.vmId, vm.node, "restart")} disabled={actionLoading === `${vm.vmId}-restart`} className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: "0.8rem" }}>{actionLoading === `${vm.vmId}-restart` ? "..." : "🔄"}</button>
                                                    <button onClick={() => handleAction(vm.vmId, vm.node, "stop")} disabled={actionLoading === `${vm.vmId}-stop`} className="btn btn-danger" style={{ padding: "8px 16px", fontSize: "0.8rem" }}>{actionLoading === `${vm.vmId}-stop` ? "Stopping..." : "⏹ Stop"}</button>
                                                </>
                                            ) : (
                                                <button onClick={() => handleAction(vm.vmId, vm.node, "start")} disabled={actionLoading === `${vm.vmId}-start`} className="btn btn-primary" style={{ padding: "8px 20px", fontSize: "0.8rem" }}>{actionLoading === `${vm.vmId}-start` ? "Starting..." : "▶ Start"}</button>
                                            )}
                                            <Link href={`/dashboard/vps/${vm.vmId}?node=${vm.node}`} className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: "0.8rem" }}>⚙️</Link>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Create VM Modal */}
            {showCreateModal && <CreateVMModal onClose={() => setShowCreateModal(false)} onCreated={loadInstances} />}
        </div>
    );
}
