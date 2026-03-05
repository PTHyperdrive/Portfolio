import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Email Solutions | Notrespond.com",
    description: "Self-hosted email with Postfix or Exchange. Custom domains, unlimited aliases, encryption, and spam filtering.",
};

const EMAIL_PLANS = [
    {
        name: "Postfix Basic",
        badge: "POSTFIX",
        price: 4.99,
        period: "/month",
        features: [
            "1 Custom Domain",
            "10 Email Accounts",
            "5 GB Storage / Account",
            "SpamAssassin Filtering",
            "DKIM / SPF / DMARC",
            "TLS Encryption",
            "IMAP / POP3 / SMTP",
            "Webmail Interface",
        ],
        color: "var(--accent-purple)",
        featured: false,
    },
    {
        name: "Postfix Pro",
        badge: "POSTFIX",
        price: 14.99,
        period: "/month",
        features: [
            "5 Custom Domains",
            "Unlimited Accounts",
            "25 GB Storage / Account",
            "Advanced Spam + Virus Filter",
            "DKIM / SPF / DMARC",
            "TLS + PGP Support",
            "Catch-All Aliases",
            "API Access",
            "Priority Support",
        ],
        color: "var(--accent-purple)",
        featured: true,
    },
    {
        name: "Exchange Business",
        badge: "EXCHANGE",
        price: 24.99,
        period: "/user/month",
        features: [
            "Unlimited Domains",
            "50 GB Mailbox / User",
            "Shared Calendars",
            "Global Address List",
            "ActiveSync / EWS",
            "Compliance & Archiving",
            "Mobile Device Management",
            "Outlook Integration",
            "Dedicated Support",
        ],
        color: "var(--accent-cyan)",
        featured: false,
    },
];

export default function EmailPage() {
    return (
        <>
            {/* Hero */}
            <section style={{ paddingTop: "140px", paddingBottom: "80px", position: "relative" }}>
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: "50%",
                        width: "600px",
                        height: "600px",
                        background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
                        pointerEvents: "none",
                        transform: "translateX(-50%)",
                    }}
                />
                <div className="container">
                    <span className="badge badge-purple" style={{ marginBottom: "16px", display: "inline-block" }}>EMAIL SOLUTIONS</span>
                    <h1 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "16px", maxWidth: "700px" }}>
                        Self-Hosted Email <br />
                        <span className="gradient-text">Under Your Control</span>
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", maxWidth: "600px", lineHeight: 1.7 }}>
                        Choose between Postfix for lightweight, Linux-native performance or Microsoft Exchange for full enterprise collaboration. Your domain, your rules.
                    </p>
                </div>
            </section>

            {/* Comparison */}
            <section className="section" style={{ paddingTop: "20px" }}>
                <div className="container">
                    {/* Feature Comparison Header */}
                    <div style={{ textAlign: "center", marginBottom: "50px" }}>
                        <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "10px" }}>
                            Postfix vs Exchange
                        </h2>
                        <p style={{ color: "var(--text-secondary)" }}>
                            Choose the right email server for your needs.
                        </p>
                    </div>

                    {/* Comparison Table */}
                    <div className="glass-card" style={{ padding: "0", marginBottom: "60px", overflow: "hidden" }}>
                        <table className="data-table">
                            <thead>
                                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                                    <th style={{ width: "40%" }}>Feature</th>
                                    <th style={{ textAlign: "center" }}>
                                        <span style={{ color: "var(--accent-purple)" }}>Postfix</span>
                                    </th>
                                    <th style={{ textAlign: "center" }}>
                                        <span style={{ color: "var(--accent-cyan)" }}>Exchange</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    { feature: "Custom Domains", postfix: "✓", exchange: "✓" },
                                    { feature: "IMAP/POP3", postfix: "✓", exchange: "✓" },
                                    { feature: "Spam Filtering", postfix: "SpamAssassin", exchange: "Built-in" },
                                    { feature: "Shared Calendars", postfix: "—", exchange: "✓" },
                                    { feature: "ActiveSync", postfix: "—", exchange: "✓" },
                                    { feature: "Resource Usage", postfix: "Low", exchange: "Medium" },
                                    { feature: "Outlook Integration", postfix: "Basic", exchange: "Full" },
                                    { feature: "Compliance Tools", postfix: "—", exchange: "✓" },
                                    { feature: "Open Source", postfix: "✓", exchange: "—" },
                                    { feature: "Starting Price", postfix: "$4.99/mo", exchange: "$24.99/user/mo" },
                                ].map((row) => (
                                    <tr key={row.feature}>
                                        <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{row.feature}</td>
                                        <td style={{ textAlign: "center" }}>
                                            <span style={{ color: row.postfix === "✓" ? "var(--accent-green)" : row.postfix === "—" ? "var(--text-muted)" : "var(--text-secondary)" }}>
                                                {row.postfix}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                            <span style={{ color: row.exchange === "✓" ? "var(--accent-green)" : row.exchange === "—" ? "var(--text-muted)" : "var(--text-secondary)" }}>
                                                {row.exchange}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pricing Cards */}
                    <div className="grid-3 stagger">
                        {EMAIL_PLANS.map((plan) => (
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

                                <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "8px" }}>{plan.name}</h3>

                                <div style={{ marginBottom: "24px" }}>
                                    <span style={{ fontSize: "2.2rem", fontWeight: 800 }}>
                                        <span className="gradient-text">${plan.price}</span>
                                    </span>
                                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{plan.period}</span>
                                </div>

                                <div style={{ marginBottom: "28px", flex: 1 }}>
                                    {plan.features.map((f) => (
                                        <div key={f} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                                            <span style={{ color: plan.color, fontSize: "0.85rem" }}>✓</span>
                                            <span style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>{f}</span>
                                        </div>
                                    ))}
                                </div>

                                <Link
                                    href="/auth/register"
                                    className={plan.featured ? "btn btn-primary" : "btn btn-secondary"}
                                    style={{ width: "100%", textAlign: "center" }}
                                >
                                    Choose Plan
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </>
    );
}
