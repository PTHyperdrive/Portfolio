import { ShieldCheck, AlertTriangle } from "lucide-react";

export const metadata = {
    title: "Privacy Policy — NotRespond",
    description: "How NotRespond collects, uses, and protects your data.",
};

const SECTIONS: { h: string; p: string }[] = [
    { h: "1. Overview", p: "This policy explains what data NotRespond collects, why, and how we protect it. It applies to our website and services." },
    { h: "2. Data we collect", p: "Account data (email, name), authentication data (password hashes, 2FA secrets stored encrypted), billing and usage records, support messages, and technical logs needed to run and secure the service." },
    { h: "3. How we use data", p: "To provide and meter services, authenticate you, prevent abuse and fraud, provide support, and meet legal obligations. We do not sell your personal data." },
    { h: "4. Cookies & analytics", p: "We use a session cookie for authentication. Aggregate, privacy-friendly traffic analytics (Cloudflare Web Analytics) are collected without cross-site tracking cookies." },
    { h: "5. Data retention", p: "We keep account and billing records while your account is active and as required by law. Audit logs are retained for security and compliance; some product data (e.g., purchased items) has a fixed retention window." },
    { h: "6. Security", p: "Secrets are encrypted at rest, access is gated by authentication and optional two-factor, and critical actions are audited. No system is perfectly secure, but we work to protect your data." },
    { h: "7. Your rights", p: "You may request access to, correction of, or deletion of your personal data, subject to legal limits. Contact us to exercise these rights." },
    { h: "8. Third parties", p: "We use infrastructure and payment providers strictly to operate the service. They process data on our behalf under their own safeguards." },
    { h: "9. Changes & contact", p: "We may update this policy; material changes will be announced. Questions: support@notrespond.com." },
];

export default function PrivacyPage() {
    return (
        <div style={{ paddingTop: "100px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: 780 }}>
                <div style={{ marginBottom: 28 }}>
                    <span className="badge badge-cyan" style={{ marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <ShieldCheck style={{ width: 14, height: 14 }} /> PRIVACY
                    </span>
                    <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.75rem)", fontWeight: 800, letterSpacing: "-0.03em" }}>Privacy Policy</h1>
                </div>

                <div className="glass-card" style={{ padding: "14px 18px", marginBottom: 28, display: "flex", gap: 10, alignItems: "flex-start", borderColor: "rgba(245,158,11,0.3)" }}>
                    <AlertTriangle style={{ width: 18, height: 18, color: "var(--accent-orange)", flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        <strong style={{ color: "var(--text-primary)" }}>Draft template.</strong> Placeholder wording — review and finalize (and confirm your actual data practices) before relying on it.
                    </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                    {SECTIONS.map(s => (
                        <section key={s.h}>
                            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>{s.h}</h2>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.7 }}>{s.p}</p>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
