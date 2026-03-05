import Link from "next/link";

const ADMIN_STATS = [
    { title: "Total Revenue", value: "$0.00", icon: "💰", color: "var(--accent-green)", change: "+0%" },
    { title: "Total Users", value: "0", icon: "👥", color: "var(--accent-cyan)", change: "+0" },
    { title: "Active Orders", value: "0", icon: "📦", color: "var(--accent-purple)", change: "+0" },
    { title: "Active Services", value: "0", icon: "🖥️", color: "var(--accent-magenta)", change: "+0" },
];

const ADMIN_LINKS = [
    { title: "Service Management", description: "Add, edit, or remove service listings", href: "/admin/services", icon: "🛠️" },
    { title: "User Management", description: "View and manage user accounts and roles", href: "/admin/users", icon: "👥" },
    { title: "Order Management", description: "Process orders and update statuses", href: "/admin/orders", icon: "📋" },
    { title: "Blog Management", description: "Create, edit, and publish blog posts", href: "/admin/blog", icon: "✍️" },
    { title: "Proxy Inventory", description: "Manage proxy stock and locations", href: "/admin/proxy", icon: "🌐" },
    { title: "VPN Servers", description: "Configure VPN server endpoints", href: "/admin/vpn", icon: "🔒" },
    { title: "System Settings", description: "Configure system parameters", href: "/admin/settings", icon: "⚙️" },
];

export default function AdminPage() {
    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container">
                {/* Header */}
                <div style={{ marginBottom: "40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "4px" }}>
                            Admin <span className="gradient-text">Panel</span>
                        </h1>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                            Manage your platform, users, and services.
                        </p>
                    </div>
                    <span className="badge badge-magenta">ADMIN ACCESS</span>
                </div>

                {/* Stats */}
                <div className="grid-4 stagger" style={{ marginBottom: "40px" }}>
                    {ADMIN_STATS.map((stat) => (
                        <div key={stat.title} className="glass-card" style={{ padding: "24px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                                <span style={{ fontSize: "1.5rem" }}>{stat.icon}</span>
                                <span className="mono" style={{ fontSize: "0.75rem", color: stat.color }}>{stat.change}</span>
                            </div>
                            <div style={{ fontSize: "2rem", fontWeight: 800, color: stat.color, marginBottom: "4px" }}>
                                {stat.value}
                            </div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{stat.title}</div>
                        </div>
                    ))}
                </div>

                {/* Quick Links */}
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "16px" }}>Management</h2>
                <div className="grid-3 stagger">
                    {ADMIN_LINKS.map((link) => (
                        <Link
                            key={link.title}
                            href={link.href}
                            className="glass-card"
                            style={{
                                padding: "28px",
                                textDecoration: "none",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                            }}
                        >
                            <div style={{ fontSize: "1.8rem" }}>{link.icon}</div>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>{link.title}</h3>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{link.description}</p>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
