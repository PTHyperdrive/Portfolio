import Link from "next/link";
import { Cpu, ShieldCheck, Globe, HardDrive, ArrowRight } from "lucide-react";

export const metadata = {
    title: "About — NotRespond",
    description: "NotRespond is a self-operated cloud platform: VPS, VPN, email, storage, and more, billed in prepaid credits.",
};

const VALUES = [
    { Icon: Cpu, title: "Real performance", body: "KVM virtual machines on enterprise hardware with NVMe storage and GPU passthrough — not oversold shared hosting." },
    { Icon: ShieldCheck, title: "Security first", body: "Multi-method 2FA, encrypted secrets at rest, per-customer VPC isolation, and an immutable audit trail on every account." },
    { Icon: Globe, title: "Full stack", body: "Compute, block & object storage, VPN/WireGuard, email, a digital-asset market, and temporary-number rentals — one wallet." },
    { Icon: HardDrive, title: "Pay as you go", body: "Prepaid credits metered hourly. Spin a server up in minutes, resize it anytime, and only pay while it runs." },
];

export default function AboutPage() {
    return (
        <div style={{ paddingTop: "100px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: 880 }}>
                <div style={{ textAlign: "center", marginBottom: "48px" }}>
                    <span className="badge badge-cyan" style={{ marginBottom: 16, display: "inline-block" }}>ABOUT</span>
                    <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 800, marginBottom: 16, letterSpacing: "-0.03em" }}>
                        Cloud infrastructure, <span className="gradient-text">on your terms</span>
                    </h1>
                    <p style={{ color: "var(--text-secondary)", maxWidth: 620, margin: "0 auto", fontSize: "1.05rem", lineHeight: 1.7 }}>
                        NotRespond is a self-operated cloud platform. We run our own hardware and network, so you get
                        direct, no-middleman access to VPS, VPN, email, storage, and more — provisioned in minutes and
                        billed in prepaid credits.
                    </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, marginBottom: 48 }}>
                    {VALUES.map(v => (
                        <div key={v.title} className="glass-card" style={{ padding: "24px" }}>
                            <v.Icon style={{ width: 24, height: 24, color: "var(--accent-cyan)", marginBottom: 12 }} />
                            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 8 }}>{v.title}</h3>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>{v.body}</p>
                        </div>
                    ))}
                </div>

                <div className="glass-card" style={{ padding: "32px", textAlign: "center" }}>
                    <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 10 }}>Ready to deploy?</h2>
                    <p style={{ color: "var(--text-muted)", marginBottom: 22, fontSize: "0.95rem" }}>Browse plans or open the console to launch your first server.</p>
                    <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                        <Link href="/services/vps" className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            View Plans <ArrowRight style={{ width: 15, height: 15 }} />
                        </Link>
                        <Link href="/dashboard" className="btn btn-secondary">Open Console</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
