import Link from "next/link";

export default function OrdersPage() {
    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container">
                <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                    Order <span className="gradient-text">History</span>
                </h1>
                <p style={{ color: "var(--text-muted)", marginBottom: "40px" }}>
                    Track all your past and active orders.
                </p>

                {/* Filters */}
                <div className="glass-card" style={{ padding: "20px 24px", marginBottom: "24px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 600 }}>Status:</span>
                    {["All", "Active", "Pending", "Completed", "Cancelled"].map((filter) => (
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
                    <div style={{ fontSize: "3rem", marginBottom: "16px" }}>📦</div>
                    <h3 style={{ fontWeight: 700, marginBottom: "8px", fontSize: "1.2rem" }}>No Orders Yet</h3>
                    <p style={{ color: "var(--text-muted)", maxWidth: "400px", margin: "0 auto 24px" }}>
                        When you purchase a service, your orders will appear here.
                    </p>
                    <Link href="/services/vps" className="btn btn-primary">
                        Browse Services
                    </Link>
                </div>
            </div>
        </div>
    );
}
