"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

const VPS_PLANS = [
    {
        name: "Trial Plan",
        badge: "VPS",
        price: "Free",
        currency: "30 Days",
        specs: {
            "CPU": "1 vCPU Core",
            "RAM": "1 GB",
            "Storage": "40 GB",
            "Tier": "SATA SSD",
            "vGPU": "None",
            "Node": "Timox-2",
        },
        features: ["Testing SSH connectivity", "NAT port forwarding", "Network latency testing"],
        featured: false,
        color: "var(--accent-purple)",
        isTrial: true,
        isHiddenFromPublic: false,
    },
    {
        name: "Nano-NAT",
        badge: "VPS",
        price: "40,000",
        period: "/month",
        currency: "Credits",
        specs: {
            "CPU": "1 vCPU Core",
            "RAM": "1 GB",
            "Storage": "64 GB",
            "Tier": "SATA SSD",
            "vGPU": "None",
            "Node": "Timox-2",
        },
        features: ["Basic VPNs", "Personal proxies", "Lightweight background scripts"],
        featured: false,
        color: "var(--accent-cyan)",
        isTrial: false,
        isHiddenFromPublic: false,
    },
    {
        name: "Dev-Standard",
        badge: "VPS",
        price: "120,000",
        period: "/month",
        currency: "Credits",
        specs: {
            "CPU": "2 vCPU Cores",
            "RAM": "4 GB",
            "Storage": "80 GB",
            "Tier": "SATA SSD",
            "vGPU": "None",
            "Node": "Timox-1 or 2",
        },
        features: ["Web dev environments", "Docker containers", "Standard websites"],
        featured: false,
        color: "var(--accent-cyan)",
        isTrial: false,
        isHiddenFromPublic: false,
    },
    {
        name: "Perform-NVMe",
        badge: "VPS",
        price: "280,000",
        period: "/month",
        currency: "Credits",
        specs: {
            "CPU": "4 vCPU Cores",
            "RAM": "8 GB",
            "Storage": "80 GB",
            "Tier": "NVMe",
            "vGPU": "None",
            "Node": "Timox-1",
        },
        features: ["Game servers (Minecraft, etc.)", "High-traffic databases", "CI/CD tasks"],
        featured: false,
        color: "var(--accent-magenta)",
        isTrial: false,
        isHiddenFromPublic: false,
    },
    {
        name: "GPU-Media",
        badge: "V-GPU",
        price: "350,000",
        period: "/month",
        currency: "Credits",
        specs: {
            "CPU": "4 vCPU Cores",
            "RAM": "8 GB",
            "Storage": "50 GB",
            "Tier": "NVMe",
            "vGPU": "2 GB VRAM (RTX 6000)",
            "Node": "Timox-1",
        },
        features: ["Hardware-accelerated video transcoding", "Remote desktop environments"],
        featured: true,
        color: "var(--accent-purple)",
        isTrial: false,
        isHiddenFromPublic: false,
    },
    {
        name: "GPU-Compute",
        badge: "V-GPU",
        price: "850,000",
        period: "/month",
        currency: "Credits",
        specs: {
            "CPU": "8 vCPU Cores",
            "RAM": "16 GB",
            "Storage": "150 GB",
            "Tier": "NVMe",
            "vGPU": "6 GB VRAM (RTX 6000)",
            "Node": "Timox-1",
        },
        features: ["AI model inference", "3D rendering", "Heavy parallel processing"],
        featured: false,
        color: "var(--accent-purple)",
        isTrial: false,
        isHiddenFromPublic: false,
    },
    {
        name: "Operator-Exclusive",
        badge: "DEDICATED",
        price: "Internal",
        period: "",
        currency: "",
        specs: {
            "CPU": "16 vCPU Cores",
            "RAM": "32 GB",
            "Storage": "250 GB + 8TB",
            "Tier": "NVMe/HDD",
            "vGPU": "4 GB VRAM (RTX 6000)",
            "Node": "Timox-1",
        },
        features: ["Isolated sandbox", "System architecture testing", "Anomalous executables analysis"],
        featured: false,
        color: "var(--accent-magenta)",
        isTrial: false,
        isHiddenFromPublic: true,
    }
];

export default function VPSPage() {
    const { data: session } = useSession();
    const userMeta = session?.user as Record<string, unknown> | undefined;
    const hasUsedTrial = userMeta?.hasUsedTrial === true;
    const isAdmin = userMeta?.role === "ADMIN";
    const activePlan = userMeta?.activePlan as string | undefined;

    const visiblePlans = VPS_PLANS.filter((p) => {
        if (p.isTrial && hasUsedTrial && !isAdmin) return false;
        if (p.name === activePlan) return false;
        if ("isHiddenFromPublic" in p && p.isHiddenFromPublic && !isAdmin) return false;
        return true;
    });

    return (
        <>
            {/* Hero */}
            <section style={{ paddingTop: "140px", paddingBottom: "80px", position: "relative" }}>
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        width: "600px",
                        height: "600px",
                        background: "radial-gradient(circle, rgba(0,240,255,0.06) 0%, transparent 70%)",
                        pointerEvents: "none",
                    }}
                />
                <div className="container">
                    <span className="badge badge-cyan" style={{ marginBottom: "16px", display: "inline-block" }}>VPS HOSTING</span>
                    <h1 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "16px", maxWidth: "700px" }}>
                        Virtual Private Servers <br />
                        <span className="gradient-text">with GPU Power</span>
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", maxWidth: "600px", lineHeight: 1.7 }}>
                        From lightweight v-GPU instances to multi-GPU enterprise clusters. Run AI workloads,
                        game servers, rendering pipelines, or any compute-intensive application.
                    </p>
                </div>
            </section>

            {/* Pricing Cards */}
            <section className="section" style={{ paddingTop: "20px" }}>
                <div className="container">
                    {visiblePlans.length === 0 ? (
                        <div className="glass-card stagger" style={{ padding: "48px 32px", textAlign: "center", maxWidth: "600px", margin: "0 auto" }}>
                            <div style={{ fontSize: "3.5rem", marginBottom: "20px" }}>🎉</div>
                            <h3 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "16px", color: "var(--text-primary)" }}>
                                You own all available plans!
                            </h3>
                            <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem", marginBottom: "32px", lineHeight: "1.6" }}>
                                You currently have active subscriptions covering everything we offer. Head to your Billing dashboard to manage your instances.
                            </p>
                            <Link href="/dashboard/billing" className="btn btn-primary" style={{ padding: "12px 24px", fontSize: "1rem" }}>
                                Go to Billing Dashboard
                            </Link>
                        </div>
                    ) : (
                        <div className="grid-3 stagger">
                            {visiblePlans.map((plan) => (
                                <div
                                    key={plan.name}
                                    className={`glass-card pricing-card ${plan.featured ? "featured" : ""}`}
                                    style={{ padding: "36px", display: "flex", flexDirection: "column" }}
                                >
                                    <span className="badge" style={{
                                        background: `${plan.color}15`,
                                        color: plan.color,
                                        marginBottom: "16px",
                                        alignSelf: "flex-start",
                                    }}>
                                        {plan.badge}
                                    </span>

                                    <h3 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "8px" }}>
                                        {plan.name}
                                    </h3>

                                    <div style={{ marginBottom: "24px", display: "flex", alignItems: "center" }}>
                                        <span style={{ fontSize: "2.5rem", fontWeight: 800 }}>
                                            <span className="gradient-text">{plan.price}</span>
                                        </span>
                                        {/* "currency" and "period" blocks */}
                                        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: "8px" }}>
                                            {"currency" in plan && <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "1rem", lineHeight: "1" }}>{(plan as any).currency}</span>}
                                            {"period" in plan && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: "1" }}>{(plan as any).period}</span>}
                                        </div>
                                    </div>

                                    {/* Specs Table */}
                                    <div style={{ marginBottom: "24px" }}>
                                        {Object.entries(plan.specs).map(([key, value]) => (
                                            <div
                                                key={key}
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    padding: "10px 0",
                                                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                                                    fontSize: "0.9rem",
                                                }}
                                            >
                                                <span style={{ color: "var(--text-muted)" }}>{key}</span>
                                                <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: "0.85rem" }}>
                                                    {value}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Features */}
                                    <div style={{ marginBottom: "28px", flex: 1 }}>
                                        {plan.features.filter(Boolean).map((f) => (
                                            <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                                                <span style={{ color: plan.color, fontSize: "0.9rem" }}>✓</span>
                                                <span style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>{f}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <Link
                                        href={`/payment?plan=${encodeURIComponent(plan.name)}`}
                                        className={plan.featured ? "btn btn-primary" : "btn btn-secondary"}
                                        style={{ width: "100%", textAlign: "center" }}
                                    >
                                        Get Started
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Technical Specs */}
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
