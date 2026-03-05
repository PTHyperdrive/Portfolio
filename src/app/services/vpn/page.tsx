import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "VPN Access | Notrespond.com",
    description: "Generate VPN configurations instantly. WireGuard, OpenVPN, IKEv2 protocols with global server locations and zero-log policy.",
};

const PROTOCOLS = [
    {
        name: "WireGuard",
        description: "Modern, ultra-fast protocol with state-of-the-art cryptography. Minimal attack surface with ~4,000 lines of code.",
        icon: "⚡",
        color: "var(--accent-cyan)",
        speed: "Fastest",
        security: "ChaCha20-Poly1305",
        compatibility: "Linux, Windows, macOS, iOS, Android",
        recommended: true,
    },
    {
        name: "OpenVPN",
        description: "Battle-tested protocol trusted worldwide. Highly configurable with support for various encryption ciphers.",
        icon: "🔐",
        color: "var(--accent-green)",
        speed: "Fast",
        security: "AES-256-GCM",
        compatibility: "All Platforms",
        recommended: false,
    },
    {
        name: "IKEv2/IPSec",
        description: "Enterprise-grade protocol with seamless reconnection. Ideal for mobile devices that switch between Wi-Fi and cellular.",
        icon: "📱",
        color: "var(--accent-purple)",
        speed: "Fast",
        security: "AES-256",
        compatibility: "Windows, macOS, iOS, Android",
        recommended: false,
    },
];

const LOCATIONS = [
    { country: "🇺🇸 United States", cities: ["New York", "Los Angeles", "Chicago", "Miami"], ping: "< 20ms" },
    { country: "🇬🇧 United Kingdom", cities: ["London", "Manchester"], ping: "< 30ms" },
    { country: "🇩🇪 Germany", cities: ["Frankfurt", "Berlin"], ping: "< 25ms" },
    { country: "🇯🇵 Japan", cities: ["Tokyo", "Osaka"], ping: "< 40ms" },
    { country: "🇸🇬 Singapore", cities: ["Singapore"], ping: "< 35ms" },
    { country: "🇳🇱 Netherlands", cities: ["Amsterdam"], ping: "< 25ms" },
    { country: "🇦🇺 Australia", cities: ["Sydney", "Melbourne"], ping: "< 50ms" },
    { country: "🇨🇦 Canada", cities: ["Toronto", "Vancouver"], ping: "< 30ms" },
];

const PLANS = [
    { name: "Basic", price: 3.99, period: "/month", configs: 3, locations: 5, bandwidth: "500 GB", devices: 1 },
    { name: "Pro", price: 7.99, period: "/month", configs: 10, locations: "All", bandwidth: "Unlimited", devices: 5, featured: true },
    { name: "Business", price: 14.99, period: "/month", configs: "Unlimited", locations: "All", bandwidth: "Unlimited", devices: 25 },
];

export default function VPNPage() {
    return (
        <>
            {/* Hero */}
            <section style={{ paddingTop: "140px", paddingBottom: "80px", position: "relative" }}>
                <div
                    style={{
                        position: "absolute", top: 0, right: 0, width: "500px", height: "500px",
                        background: "radial-gradient(circle, rgba(0,255,136,0.06) 0%, transparent 70%)",
                        pointerEvents: "none",
                    }}
                />
                <div className="container">
                    <span className="badge badge-green" style={{ marginBottom: "16px", display: "inline-block" }}>VPN ACCESS</span>
                    <h1 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "16px", maxWidth: "700px" }}>
                        Generate Your Own <br />
                        <span className="gradient-text">VPN Configurations</span>
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", maxWidth: "600px", lineHeight: 1.7 }}>
                        Choose your protocol, pick a server location, and instantly generate a ready-to-use config file. No apps needed — just import and connect.
                    </p>
                </div>
            </section>

            {/* Config Generator Preview */}
            <section className="section" style={{ paddingTop: "0" }}>
                <div className="container">
                    <div className="glass-card" style={{ padding: "36px", marginBottom: "60px" }}>
                        <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ color: "var(--accent-green)" }}>⚙</span> Config Generator Preview
                        </h3>
                        <div
                            className="mono"
                            style={{
                                background: "rgba(0,0,0,0.4)",
                                borderRadius: "10px",
                                padding: "24px",
                                fontSize: "0.82rem",
                                lineHeight: 1.8,
                                color: "var(--text-secondary)",
                                overflow: "auto",
                            }}
                        >
                            <div><span style={{ color: "var(--accent-cyan)" }}>[Interface]</span></div>
                            <div>PrivateKey = <span style={{ color: "var(--accent-magenta)" }}>+GhJ7k9d...</span></div>
                            <div>Address = <span style={{ color: "var(--accent-green)" }}>10.0.0.2/32</span></div>
                            <div>DNS = <span style={{ color: "var(--text-muted)" }}>1.1.1.1, 8.8.8.8</span></div>
                            <div style={{ marginTop: "12px" }}>
                                <span style={{ color: "var(--accent-cyan)" }}>[Peer]</span>
                            </div>
                            <div>PublicKey = <span style={{ color: "var(--accent-magenta)" }}>aB2cX9...</span></div>
                            <div>Endpoint = <span style={{ color: "var(--accent-green)" }}>us-east.vpn.notrespond.com:51820</span></div>
                            <div>AllowedIPs = <span style={{ color: "var(--text-muted)" }}>0.0.0.0/0</span></div>
                        </div>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "12px" }}>
                            ↑ Sample WireGuard config — real configs are generated with unique keys for each user
                        </p>
                    </div>
                </div>
            </section>

            {/* Protocols */}
            <section className="section" style={{ paddingTop: "0" }}>
                <div className="container">
                    <h2 style={{ fontSize: "2rem", fontWeight: 800, textAlign: "center", marginBottom: "50px" }}>
                        Supported <span className="gradient-text">Protocols</span>
                    </h2>
                    <div className="grid-3 stagger">
                        {PROTOCOLS.map((p) => (
                            <div key={p.name} className="glass-card" style={{ padding: "32px", position: "relative", overflow: "hidden" }}>
                                {p.recommended && (
                                    <span className="badge badge-green" style={{ position: "absolute", top: "16px", right: "16px" }}>
                                        RECOMMENDED
                                    </span>
                                )}
                                <div style={{ fontSize: "2rem", marginBottom: "12px" }}>{p.icon}</div>
                                <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "8px" }}>{p.name}</h3>
                                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "20px" }}>
                                    {p.description}
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                    {[
                                        { label: "Speed", value: p.speed },
                                        { label: "Encryption", value: p.security },
                                        { label: "Platforms", value: p.compatibility },
                                    ].map((spec) => (
                                        <div key={spec.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                                            <span style={{ color: "var(--text-muted)" }}>{spec.label}</span>
                                            <span className="mono" style={{ color: p.color, fontSize: "0.8rem" }}>{spec.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Locations */}
            <section className="section" style={{ background: "rgba(255,255,255,0.01)" }}>
                <div className="container">
                    <h2 style={{ fontSize: "2rem", fontWeight: 800, textAlign: "center", marginBottom: "50px" }}>
                        Global <span className="gradient-text">Server Locations</span>
                    </h2>
                    <div className="grid-4 stagger">
                        {LOCATIONS.map((loc) => (
                            <div key={loc.country} className="glass-card" style={{ padding: "20px" }}>
                                <h4 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "6px" }}>{loc.country}</h4>
                                <p className="mono" style={{ fontSize: "0.78rem", color: "var(--accent-cyan)", marginBottom: "8px" }}>
                                    {loc.ping}
                                </p>
                                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{loc.cities.join(", ")}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section className="section">
                <div className="container">
                    <h2 style={{ fontSize: "2rem", fontWeight: 800, textAlign: "center", marginBottom: "50px" }}>
                        Simple <span className="gradient-text">Pricing</span>
                    </h2>
                    <div className="grid-3 stagger">
                        {PLANS.map((plan) => (
                            <div
                                key={plan.name}
                                className={`glass-card pricing-card ${plan.featured ? "featured" : ""}`}
                                style={{ padding: "36px", textAlign: "center" }}
                            >
                                <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "12px" }}>{plan.name}</h3>
                                <div style={{ marginBottom: "24px" }}>
                                    <span style={{ fontSize: "2.5rem", fontWeight: 800 }}>
                                        <span className="gradient-text">${plan.price}</span>
                                    </span>
                                    <span style={{ color: "var(--text-muted)" }}>{plan.period}</span>
                                </div>

                                <div style={{ textAlign: "left", marginBottom: "24px" }}>
                                    {[
                                        { label: "Configs", value: plan.configs },
                                        { label: "Locations", value: plan.locations },
                                        { label: "Bandwidth", value: plan.bandwidth },
                                        { label: "Devices", value: plan.devices },
                                    ].map((item) => (
                                        <div key={item.label} style={{
                                            display: "flex", justifyContent: "space-between", padding: "8px 0",
                                            borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.9rem",
                                        }}>
                                            <span style={{ color: "var(--text-muted)" }}>{item.label}</span>
                                            <span className="mono" style={{ color: "var(--text-primary)" }}>{item.value}</span>
                                        </div>
                                    ))}
                                </div>

                                <Link
                                    href="/auth/register"
                                    className={plan.featured ? "btn btn-primary" : "btn btn-secondary"}
                                    style={{ width: "100%" }}
                                >
                                    Select Plan
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </>
    );
}
