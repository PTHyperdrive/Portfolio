import Link from "next/link";
import { Mail, Ticket, MessageSquare, Clock } from "lucide-react";

export const metadata = {
    title: "Contact — NotRespond",
    description: "Reach NotRespond support by email or open a support ticket from your dashboard.",
};

export default function ContactPage() {
    return (
        <div style={{ paddingTop: "100px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: 760 }}>
                <div style={{ textAlign: "center", marginBottom: "48px" }}>
                    <span className="badge badge-cyan" style={{ marginBottom: 16, display: "inline-block" }}>CONTACT</span>
                    <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 800, marginBottom: 16, letterSpacing: "-0.03em" }}>
                        Get in <span className="gradient-text">touch</span>
                    </h1>
                    <p style={{ color: "var(--text-secondary)", maxWidth: 560, margin: "0 auto", fontSize: "1.05rem", lineHeight: 1.7 }}>
                        Account, billing, or technical questions — here&apos;s how to reach us.
                    </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginBottom: 24 }}>
                    <a href="mailto:support@notrespond.com" className="glass-card" style={{ padding: "24px", textDecoration: "none", display: "block" }}>
                        <Mail style={{ width: 22, height: 22, color: "var(--accent-cyan)", marginBottom: 12 }} />
                        <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>Email support</h3>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 8 }}>For general and billing enquiries.</p>
                        <span style={{ color: "var(--accent-cyan)", fontWeight: 600, fontSize: "0.9rem" }}>support@notrespond.com</span>
                    </a>

                    <Link href="/dashboard/tickets" className="glass-card" style={{ padding: "24px", textDecoration: "none", display: "block" }}>
                        <Ticket style={{ width: 22, height: 22, color: "var(--accent-cyan)", marginBottom: 12 }} />
                        <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>Open a ticket</h3>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 8 }}>Track technical issues from your dashboard.</p>
                        <span style={{ color: "var(--accent-cyan)", fontWeight: 600, fontSize: "0.9rem" }}>Go to Support Tickets →</span>
                    </Link>

                    <div className="glass-card" style={{ padding: "24px" }}>
                        <MessageSquare style={{ width: 22, height: 22, color: "var(--accent-cyan)", marginBottom: 12 }} />
                        <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>Encrypted chat</h3>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>End-to-end encrypted live chat is available to signed-in customers inside the marketplace.</p>
                    </div>

                    <div className="glass-card" style={{ padding: "24px" }}>
                        <Clock style={{ width: 22, height: 22, color: "var(--accent-cyan)", marginBottom: 12 }} />
                        <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>Response time</h3>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Most requests are answered within 24 hours. Account-access issues are prioritised.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
