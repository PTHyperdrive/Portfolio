import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "VPS Hosting | Notrespond.com",
    description: "High-performance VPS with v-GPU, dedicated GPU, and cloud server options. NVMe SSD, DDoS protection, 99.9% uptime SLA.",
};

const VPS_PLANS = [
    {
        name: "Trial Plan",
        badge: "VPS",
        price: "Free 30 Days",
        specs: {
            CPU: "2 vCPU Cores",
            RAM: "2 GB DDR4",
            Storage: "32GB Sata SSD",
            Bandwidth: "45Mbit/s",
            GPU: "N/A",
        },
        features: ["24/7 Operation", "Limited Network", "Dedicated Manager", "Customized Config"],
        featured: false,
        color: "var(--accent-purple)",
    },
    {
        name: "Cloud Starter",
        badge: "VPS",
        price: 4.99,
        period: "/month",
        specs: {
            CPU: "2 vCPU Cores",
            RAM: "4 GB DDR4",
            Storage: "80 GB NVMe SSD",
            Bandwidth: "100Mbit/s",
            GPU: "N/A",
        },
        features: ["Private Network", "DDoS Protection", "SIEM ready", "24/7 Monitoring", "Service ready",],
        featured: false,
        color: "var(--accent-cyan)",
    },
    {
        name: "Cloud Gaming",
        badge: "VPS",
        price: 5.99,
        period: "/month",
        specs: {
            CPU: "8 vCPU Cores",
            RAM: "16 GB DDR4",
            Storage: "256GB SSD + 512GB HDD",
            Bandwidth: "1Gbit/s",
            GPU: "AMD or NVIDIA",
        },
        features: ["Tailscale Supported", "Account Protection", "Parsec & Sunshine ready", "Always up to date"],
        featured: false,
        color: "var(--accent-cyan)",
    },
    {
        name: "Cloud Workstation",
        badge: "DEDICATED GPU",
        price: 49.99,
        period: "/hour",
        specs: {
            CPU: "8 vCPU Cores",
            RAM: "32 GB DDR4",
            Storage: "500 GB NVMe SSD",
            Bandwidth: "10 TB",
            GPU: "AMD RX580 2048P",
        },
        features: ["DirectML Support", "PCIe Passthrough", "Priority Support", "Auto-Scaling", "File 3-2-1 Backup system", "Hourly Snapshots", "Full workstation applications supports"],
        featured: true,
        color: "var(--accent-magenta)",
    },
    {
        name: "Enterprise",
        badge: "V-GPU",
        price: 149.99,
        period: "/month",
        specs: {
            CPU: "32 vCPU Cores",
            RAM: "128 GB DDR4 ECC",
            Storage: "2 TB NVMe SSD",
            Bandwidth: "Unmetered",
            GPU: "NVIDIA RTX 6000",
        },
        features: ["Multi-GPU Cluster", "Dedicated Static IP", "Dedicated SDN", "CUDA & Tensor Supported", "Customized Config", "A.I Optimized"],
        featured: false,
        color: "var(--accent-purple)",
    },
    {
        name: "Anti-Detect VPS",
        badge: "Specialized",
        price: "Negotiable",
        specs: {
            CPU: "32 vCPU Cores",
            RAM: "64 GB DDR4 ECC",
            Storage: "256 U.2 SSD",
            Bandwidth: "Unmetered",
            GPU: "Optional",
        },
        features: ["VM full control", "Allow VM present obfuscation", "Dedicated custom network", "Customized CPU instructions", "Heavily customized VM", "Wireshark capturing supported"],
        featured: false,
        color: "var(--accent-cyan)",
    },
];

export default function VPSPage() {
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
                    <div className="grid-3 stagger">
                        {VPS_PLANS.map((plan) => (
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

                                <div style={{ marginBottom: "24px" }}>
                                    <span style={{ fontSize: "2.5rem", fontWeight: 800 }}>
                                        <span className="gradient-text">${plan.price}</span>
                                    </span>
                                    <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{plan.period}</span>
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
                                    href="/auth/register"
                                    className={plan.featured ? "btn btn-primary" : "btn btn-secondary"}
                                    style={{ width: "100%", textAlign: "center" }}
                                >
                                    Get Started
                                </Link>
                            </div>
                        ))}
                    </div>
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
