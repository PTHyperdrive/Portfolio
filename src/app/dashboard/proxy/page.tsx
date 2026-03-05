export default function ProxyDashboard() {
    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container">
                <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                    Proxy <span className="gradient-text">Accounts</span>
                </h1>
                <p style={{ color: "var(--text-muted)", marginBottom: "40px" }}>
                    Manage your active proxy accounts and credentials.
                </p>

                {/* Filters */}
                <div className="glass-card" style={{ padding: "20px 24px", marginBottom: "24px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 600 }}>Filter:</span>
                    {["All", "HTTP", "SOCKS5", "Residential"].map((filter) => (
                        <button
                            key={filter}
                            className="btn btn-ghost"
                            style={{
                                padding: "6px 14px", fontSize: "0.82rem", borderRadius: "6px",
                                border: "1px solid var(--glass-border)",
                                ...(filter === "All" ? { borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)", background: "rgba(0,240,255,0.05)" } : {}),
                            }}
                        >
                            {filter}
                        </button>
                    ))}
                </div>

                {/* Empty State */}
                <div className="glass-card" style={{ padding: "60px 40px", textAlign: "center" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "16px" }}>🌐</div>
                    <h3 style={{ fontWeight: 700, marginBottom: "8px", fontSize: "1.2rem" }}>No Active Proxies</h3>
                    <p style={{ color: "var(--text-muted)", maxWidth: "400px", margin: "0 auto 24px" }}>
                        Purchase proxy accounts from our marketplace to manage them here.
                    </p>
                    <a href="/services/proxy" className="btn btn-primary">
                        Browse Proxy Plans
                    </a>
                </div>

                {/* Credential Format Info */}
                <div className="glass-card" style={{ padding: "24px", marginTop: "24px" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: "var(--accent-cyan)" }}>ℹ</span> Credential Format
                    </h3>
                    <div className="mono" style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.8 }}>
                        <div style={{ marginBottom: "8px" }}>
                            <span style={{ color: "var(--text-secondary)" }}>HTTP:</span>{" "}
                            <span style={{ color: "var(--accent-cyan)" }}>host:port:username:password</span>
                        </div>
                        <div style={{ marginBottom: "8px" }}>
                            <span style={{ color: "var(--text-secondary)" }}>SOCKS5:</span>{" "}
                            <span style={{ color: "var(--accent-purple)" }}>socks5://username:password@host:port</span>
                        </div>
                        <div>
                            <span style={{ color: "var(--text-secondary)" }}>Residential:</span>{" "}
                            <span style={{ color: "var(--accent-magenta)" }}>http://user-zone-{"{zone}"}:pass@gate.notrespond.com:7777</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
