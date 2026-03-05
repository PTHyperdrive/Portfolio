import Link from "next/link";

const DASHBOARD_CARDS = [
    {
        title: "Active VPS",
        value: "0",
        subtitle: "Instances running",
        icon: "🖥️",
        color: "var(--accent-cyan)",
        href: "/dashboard/orders",
    },
    {
        title: "VPN Configs",
        value: "0",
        subtitle: "Active configurations",
        icon: "🔒",
        color: "var(--accent-green)",
        href: "/dashboard/vpn",
    },
    {
        title: "Proxy Accounts",
        value: "0",
        subtitle: "Active proxies",
        icon: "🌐",
        color: "var(--accent-magenta)",
        href: "/dashboard/proxy",
    },
    {
        title: "Email Accounts",
        value: "0",
        subtitle: "Active mailboxes",
        icon: "📧",
        color: "var(--accent-purple)",
        href: "/dashboard/orders",
    },
];

const QUICK_ACTIONS = [
    { label: "Generate VPN Config", href: "/dashboard/vpn", icon: "⚡" },
    { label: "Buy Proxy Accounts", href: "/services/proxy", icon: "🛒" },
    { label: "Deploy New VPS", href: "/services/vps", icon: "🚀" },
    { label: "View Orders", href: "/dashboard/orders", icon: "📋" },
];

export default function DashboardPage() {
    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container">
                {/* Header */}
                <div style={{ marginBottom: "40px" }}>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                        Dashboard
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                        Welcome back! Here&apos;s an overview of your services.
                    </p>
                </div>

                {/* Service Summary Cards */}
                <div className="grid-4 stagger" style={{ marginBottom: "40px" }}>
                    {DASHBOARD_CARDS.map((card) => (
                        <Link
                            key={card.title}
                            href={card.href}
                            className="glass-card"
                            style={{
                                padding: "24px",
                                textDecoration: "none",
                                display: "block",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                                <div style={{ fontSize: "1.5rem" }}>{card.icon}</div>
                                <span style={{ color: card.color, fontSize: "0.75rem", fontWeight: 600 }}>→</span>
                            </div>
                            <div style={{ fontSize: "2rem", fontWeight: 800, color: card.color, marginBottom: "4px" }}>
                                {card.value}
                            </div>
                            <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "2px" }}>{card.title}</div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{card.subtitle}</div>
                        </Link>
                    ))}
                </div>

                {/* Quick Actions */}
                <div style={{ marginBottom: "40px" }}>
                    <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "16px" }}>Quick Actions</h2>
                    <div className="grid-4" style={{ gap: "12px" }}>
                        {QUICK_ACTIONS.map((action) => (
                            <Link
                                key={action.label}
                                href={action.href}
                                className="glass-card"
                                style={{
                                    padding: "16px 20px",
                                    textDecoration: "none",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                }}
                            >
                                <span style={{ fontSize: "1.2rem" }}>{action.icon}</span>
                                <span style={{ fontSize: "0.88rem", fontWeight: 500 }}>{action.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Recent Orders (placeholder) */}
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                        <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Recent Orders</h2>
                        <Link href="/dashboard/orders" style={{ color: "var(--accent-cyan)", fontSize: "0.85rem", textDecoration: "none" }}>
                            View All →
                        </Link>
                    </div>
                    <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
                        <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📦</div>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                            No orders yet. Browse our services to get started.
                        </p>
                        <Link href="/services/vps" className="btn btn-secondary" style={{ marginTop: "16px" }}>
                            Explore Services
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
