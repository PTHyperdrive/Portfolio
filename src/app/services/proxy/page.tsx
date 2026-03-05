import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Proxy Network | Notrespond.com",
    description: "Premium proxy accounts worldwide. HTTP, SOCKS5, and residential proxies with 100+ locations and bulk pricing.",
};

const PROXY_TYPES = [
    {
        name: "HTTP/HTTPS",
        badge: "DATACENTER",
        icon: "🌀",
        color: "var(--accent-cyan)",
        price: "$0.50",
        unit: "/ proxy / month",
        description: "Fast datacenter proxies for web scraping, SEO monitoring, and API access. High speed, low latency.",
        features: ["Sub-second Response", "Unlimited Bandwidth", "IP Authentication", "HTTPS Support"],
        stock: 5420,
    },
    {
        name: "SOCKS5",
        badge: "PREMIUM",
        icon: "🔷",
        color: "var(--accent-purple)",
        price: "$1.00",
        unit: "/ proxy / month",
        description: "Protocol-agnostic proxies supporting any TCP/UDP traffic. Perfect for P2P, gaming, and custom applications.",
        features: ["UDP Support", "Any Protocol", "DNS Tunneling", "High Anonymity"],
        stock: 3280,
    },
    {
        name: "Residential",
        badge: "ELITE",
        icon: "🏠",
        color: "var(--accent-magenta)",
        price: "$5.00",
        unit: "/ proxy / month",
        description: "Real residential IPs that are virtually undetectable. Bypass any geo-restriction or anti-bot system.",
        features: ["Real ISP IPs", "Rotating Pool", "City-Level Targeting", "99.9% Undetectable"],
        stock: 1850,
    },
];

const LOCATIONS = [
    { flag: "🇺🇸", country: "United States", code: "US", stock: 2500 },
    { flag: "🇬🇧", country: "United Kingdom", code: "GB", stock: 800 },
    { flag: "🇩🇪", country: "Germany", code: "DE", stock: 650 },
    { flag: "🇫🇷", country: "France", code: "FR", stock: 420 },
    { flag: "🇯🇵", country: "Japan", code: "JP", stock: 380 },
    { flag: "🇧🇷", country: "Brazil", code: "BR", stock: 300 },
    { flag: "🇮🇳", country: "India", code: "IN", stock: 450 },
    { flag: "🇸🇬", country: "Singapore", code: "SG", stock: 280 },
    { flag: "🇰🇷", country: "South Korea", code: "KR", stock: 350 },
    { flag: "🇳🇱", country: "Netherlands", code: "NL", stock: 520 },
    { flag: "🇦🇺", country: "Australia", code: "AU", stock: 200 },
    { flag: "🇨🇦", country: "Canada", code: "CA", stock: 380 },
    { flag: "🇷🇺", country: "Russia", code: "RU", stock: 600 },
    { flag: "🇻🇳", country: "Vietnam", code: "VN", stock: 180 },
    { flag: "🇹🇭", country: "Thailand", code: "TH", stock: 150 },
    { flag: "🇹🇷", country: "Turkey", code: "TR", stock: 220 },
];

const BULK_PRICING = [
    { qty: "1-10", http: "$0.50", socks5: "$1.00", residential: "$5.00" },
    { qty: "11-50", http: "$0.40", socks5: "$0.85", residential: "$4.00" },
    { qty: "51-200", http: "$0.30", socks5: "$0.70", residential: "$3.50" },
    { qty: "201-500", http: "$0.20", socks5: "$0.50", residential: "$2.50" },
    { qty: "500+", http: "$0.10", socks5: "$0.35", residential: "$2.00" },
];

export default function ProxyPage() {
    return (
        <>
            {/* Hero */}
            <section style={{ paddingTop: "140px", paddingBottom: "80px", position: "relative" }}>
                <div
                    style={{
                        position: "absolute", top: 0, left: 0, width: "500px", height: "500px",
                        background: "radial-gradient(circle, rgba(255,0,110,0.06) 0%, transparent 70%)",
                        pointerEvents: "none",
                    }}
                />
                <div className="container">
                    <span className="badge badge-magenta" style={{ marginBottom: "16px", display: "inline-block" }}>PROXY NETWORK</span>
                    <h1 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "16px", maxWidth: "700px" }}>
                        Premium Proxy <br />
                        <span className="gradient-text-secondary">Accounts & Locations</span>
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", maxWidth: "600px", lineHeight: 1.7 }}>
                        HTTP, SOCKS5, and Residential proxies across 100+ locations. Bulk pricing available.
                        Instant account delivery with API access.
                    </p>
                </div>
            </section>

            {/* Proxy Types */}
            <section className="section" style={{ paddingTop: "0" }}>
                <div className="container">
                    <div className="grid-3 stagger">
                        {PROXY_TYPES.map((type) => (
                            <div
                                key={type.name}
                                className="glass-card"
                                style={{ padding: "32px", display: "flex", flexDirection: "column" }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                                    <div style={{ fontSize: "2.2rem" }}>{type.icon}</div>
                                    <span className="badge" style={{ background: `${type.color}15`, color: type.color }}>
                                        {type.badge}
                                    </span>
                                </div>

                                <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "8px" }}>{type.name}</h3>

                                <div style={{ marginBottom: "16px" }}>
                                    <span style={{ fontSize: "1.8rem", fontWeight: 800, color: type.color }}>{type.price}</span>
                                    <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}> {type.unit}</span>
                                </div>

                                <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: "20px" }}>
                                    {type.description}
                                </p>

                                <div style={{ marginBottom: "20px", flex: 1 }}>
                                    {type.features.map((f) => (
                                        <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                                            <span style={{ color: type.color, fontSize: "0.8rem" }}>✓</span>
                                            <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{f}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Stock indicator */}
                                <div style={{
                                    padding: "10px 16px",
                                    background: "rgba(0,0,0,0.3)",
                                    borderRadius: "8px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: "16px",
                                }}>
                                    <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>In Stock</span>
                                    <span className="mono" style={{ color: "var(--accent-green)", fontWeight: 600, fontSize: "0.9rem" }}>
                                        {type.stock.toLocaleString()}
                                    </span>
                                </div>

                                <Link href="/auth/register" className="btn btn-secondary" style={{ width: "100%" }}>
                                    Buy Now
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Locations Grid (taphoammo-style product listing) */}
            <section className="section" style={{ background: "rgba(255,255,255,0.01)" }}>
                <div className="container">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", flexWrap: "wrap", gap: "12px" }}>
                        <div>
                            <h2 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: "4px" }}>
                                Available <span className="gradient-text">Locations</span>
                            </h2>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                                Select a location to browse available proxy accounts
                            </p>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                            {["All", "HTTP", "SOCKS5", "Residential"].map((filter) => (
                                <button
                                    key={filter}
                                    className="btn btn-ghost"
                                    style={{
                                        padding: "6px 14px",
                                        fontSize: "0.82rem",
                                        borderRadius: "6px",
                                        border: "1px solid var(--glass-border)",
                                        ...(filter === "All" ? { borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)", background: "rgba(0,240,255,0.05)" } : {}),
                                    }}
                                >
                                    {filter}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid-4 stagger">
                        {LOCATIONS.map((loc) => (
                            <div
                                key={loc.code}
                                className="glass-card"
                                style={{
                                    padding: "20px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    cursor: "pointer",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                    <span style={{ fontSize: "1.5rem" }}>{loc.flag}</span>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{loc.country}</div>
                                        <div className="mono" style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{loc.code}</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div className="mono" style={{ color: "var(--accent-green)", fontWeight: 600, fontSize: "0.85rem" }}>
                                        {loc.stock}
                                    </div>
                                    <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>available</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Bulk Pricing Table */}
            <section className="section">
                <div className="container">
                    <h2 style={{ fontSize: "2rem", fontWeight: 800, textAlign: "center", marginBottom: "50px" }}>
                        Bulk <span className="gradient-text-secondary">Pricing</span>
                    </h2>

                    <div className="glass-card" style={{ overflow: "hidden", maxWidth: "800px", margin: "0 auto" }}>
                        <table className="data-table">
                            <thead>
                                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                                    <th>Quantity</th>
                                    <th style={{ textAlign: "center" }}>
                                        <span style={{ color: "var(--accent-cyan)" }}>HTTP</span>
                                    </th>
                                    <th style={{ textAlign: "center" }}>
                                        <span style={{ color: "var(--accent-purple)" }}>SOCKS5</span>
                                    </th>
                                    <th style={{ textAlign: "center" }}>
                                        <span style={{ color: "var(--accent-magenta)" }}>Residential</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {BULK_PRICING.map((row) => (
                                    <tr key={row.qty}>
                                        <td className="mono" style={{ fontWeight: 600 }}>{row.qty}</td>
                                        <td className="mono" style={{ textAlign: "center", color: "var(--accent-cyan)" }}>{row.http}</td>
                                        <td className="mono" style={{ textAlign: "center", color: "var(--accent-purple)" }}>{row.socks5}</td>
                                        <td className="mono" style={{ textAlign: "center", color: "var(--accent-magenta)" }}>{row.residential}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ textAlign: "center", marginTop: "30px" }}>
                        <Link href="/auth/register" className="btn btn-primary" style={{ padding: "14px 40px" }}>
                            Start Buying →
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
