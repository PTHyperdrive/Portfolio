import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "MMO Market | Notrespond.com",
    description: "Digital asset marketplace. Buy accounts, emails, game assets and more with instant delivery. Pipe-delimited data format with 30-day retention.",
};

const ASSET_TYPES = [
    {
        name: "Game Accounts",
        badge: "POPULAR",
        icon: "GA",
        color: "var(--accent-cyan)",
        price: "From 500 Cr",
        unit: "/ account",
        description: "Pre-leveled game accounts for popular MMOs and competitive games. Instant delivery with full credentials.",
        features: ["Instant Delivery", "Full Credentials", "Recovery Info", "Change Password Ready"],
    },
    {
        name: "Email Accounts",
        badge: "BULK",
        icon: "EM",
        color: "var(--accent-purple)",
        price: "From 100 Cr",
        unit: "/ account",
        description: "Aged and fresh email accounts from major providers. Perfect for marketing, verification, and automation.",
        features: ["Aged Accounts", "POP3/IMAP Access", "Recovery Email", "Bulk Available"],
    },
    {
        name: "Premium Subscriptions",
        badge: "ELITE",
        icon: "PS",
        color: "var(--accent-magenta)",
        price: "From 1,000 Cr",
        unit: "/ account",
        description: "Premium streaming, cloud storage, and software subscription accounts. Verified and ready to use.",
        features: ["Verified Active", "Full Access", "Warranty Period", "Multiple Providers"],
    },
];

const FEATURES = [
    { title: "Instant Delivery", desc: "Purchased assets delivered immediately in plaintext format" },
    { title: "Pipe-Delimited Format", desc: "Clean data structure: email|password|recovery|extras" },
    { title: "30-Day Data Retention", desc: "Access your purchased data for 30 days after purchase" },
    { title: "Bulk Orders", desc: "Purchase up to 1,000 items per single order" },
    { title: "Credit System", desc: "Use your existing credit balance — no separate payment needed" },
    { title: "Copy & Download", desc: "One-click copy all or download as .txt file" },
];

export default function MmoServicePage() {
    return (
        <>
            {/* Hero */}
            <section style={{ paddingTop: "140px", paddingBottom: "80px", position: "relative" }}>
                <div
                    style={{
                        position: "absolute", top: 0, left: 0, width: "500px", height: "500px",
                        background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
                        pointerEvents: "none",
                    }}
                />
                <div className="container">
                    <span className="badge badge-purple" style={{ marginBottom: "16px", display: "inline-block" }}>MMO MARKETPLACE</span>
                    <h1 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "16px", maxWidth: "700px" }}>
                        Digital Asset <br />
                        <span className="gradient-text-secondary">Marketplace</span>
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", maxWidth: "600px", lineHeight: 1.7 }}>
                        Buy digital assets, game accounts, and premium subscriptions.
                        Instant delivery in pipe-delimited plaintext format. Up to 1,000 items per order.
                    </p>
                    <div style={{ marginTop: "28px", display: "flex", gap: "12px" }}>
                        <Link href="/auth/register" className="btn btn-primary" style={{ padding: "14px 32px" }}>
                            Start Buying
                        </Link>
                        <Link href="/auth/login" className="btn btn-ghost" style={{ padding: "14px 32px" }}>
                            Log In
                        </Link>
                    </div>
                </div>
            </section>

            {/* Asset Types */}
            <section className="section" style={{ paddingTop: "0" }}>
                <div className="container">
                    <div className="grid-3 stagger">
                        {ASSET_TYPES.map((type) => (
                            <div
                                key={type.name}
                                className="glass-card"
                                style={{ padding: "32px", display: "flex", flexDirection: "column" }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                                    <div style={{ fontSize: "0.78rem", fontWeight: 800, letterSpacing: "0.1em", color: type.color, fontFamily: "monospace" }}>{type.icon}</div>
                                    <span className="badge" style={{ background: `${type.color}15`, color: type.color }}>
                                        {type.badge}
                                    </span>
                                </div>

                                <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "8px" }}>{type.name}</h3>

                                <div style={{ marginBottom: "16px" }}>
                                    <span style={{ fontSize: "1.5rem", fontWeight: 800, color: type.color }}>{type.price}</span>
                                    <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}> {type.unit}</span>
                                </div>

                                <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: "20px" }}>
                                    {type.description}
                                </p>

                                <div style={{ marginBottom: "20px", flex: 1 }}>
                                    {type.features.map((f) => (
                                        <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={type.color} strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
                                            <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{f}</span>
                                        </div>
                                    ))}
                                </div>

                                <Link href="/auth/register" className="btn btn-secondary" style={{ width: "100%" }}>
                                    Browse & Buy
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How it Works */}
            <section className="section" style={{ background: "rgba(255,255,255,0.01)" }}>
                <div className="container">
                    <h2 style={{ fontSize: "2rem", fontWeight: 800, textAlign: "center", marginBottom: "50px" }}>
                        How It <span className="gradient-text">Works</span>
                    </h2>

                    <div className="grid-3 stagger">
                        {[
                            { step: "01", title: "Browse", desc: "Explore available categories and check real-time stock levels" },
                            { step: "02", title: "Purchase", desc: "Select quantity (up to 1,000) and pay with your credit balance" },
                            { step: "03", title: "Download", desc: "Instantly receive data in pipe-delimited format. Copy or download as .txt" },
                        ].map((s) => (
                            <div key={s.step} className="glass-card" style={{ padding: "32px", textAlign: "center" }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 12,
                                    background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    margin: "0 auto 16px", fontFamily: "monospace",
                                    fontSize: "1.1rem", fontWeight: 800, color: "var(--accent-cyan)",
                                }}>{s.step}</div>
                                <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "8px" }}>{s.title}</h3>
                                <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.6 }}>{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="section">
                <div className="container">
                    <h2 style={{ fontSize: "2rem", fontWeight: 800, textAlign: "center", marginBottom: "50px" }}>
                        Platform <span className="gradient-text-secondary">Features</span>
                    </h2>
                    <div className="grid-3 stagger">
                        {FEATURES.map((f) => (
                            <div key={f.title} className="glass-card" style={{ padding: "24px" }}>
                                <h4 style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "8px" }}>{f.title}</h4>
                                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.6 }}>{f.desc}</p>
                            </div>
                        ))}
                    </div>

                    <div style={{ textAlign: "center", marginTop: "40px" }}>
                        <Link href="/auth/register" className="btn btn-primary" style={{ padding: "14px 40px" }}>
                            Create Account & Start Buying
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
