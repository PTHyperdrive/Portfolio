import { Activity, CheckCircle2 } from "lucide-react";

export const metadata = {
    title: "System Status — NotRespond",
    description: "Operational status of NotRespond cloud services.",
};

const SERVICES = [
    "Compute (VPS)",
    "Block & Object Storage",
    "Networking & VPN",
    "Console (noVNC)",
    "Billing & Credits",
    "TimoSMS",
    "Support",
];

export default function StatusPage() {
    return (
        <div style={{ paddingTop: "100px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: 760 }}>
                <div style={{ textAlign: "center", marginBottom: "40px" }}>
                    <span className="badge badge-cyan" style={{ marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Activity style={{ width: 14, height: 14 }} /> STATUS
                    </span>
                    <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 800, marginBottom: 16, letterSpacing: "-0.03em" }}>
                        System <span className="gradient-text">Status</span>
                    </h1>
                </div>

                <div className="glass-card" style={{ padding: "18px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, borderColor: "rgba(0,200,120,0.3)" }}>
                    <CheckCircle2 style={{ width: 22, height: 22, color: "var(--accent-green)" }} />
                    <div>
                        <p style={{ fontWeight: 700, color: "var(--accent-green)" }}>All systems operational</p>
                        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>Static snapshot — live status integration is coming soon.</p>
                    </div>
                </div>

                <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
                    {SERVICES.map((s, i) => (
                        <div key={s} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "14px 22px",
                            borderTop: i === 0 ? "none" : "1px solid var(--glass-border)",
                        }}>
                            <span style={{ fontSize: "0.92rem", color: "var(--text-primary)", fontWeight: 600 }}>{s}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--accent-green)", fontWeight: 600 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-green)" }} /> Operational
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
