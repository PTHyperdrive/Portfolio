import { FileText, AlertTriangle } from "lucide-react";

export const metadata = {
    title: "Terms of Service — NotRespond",
    description: "Terms of Service for NotRespond cloud services.",
};

const SECTIONS: { h: string; p: string }[] = [
    { h: "1. Acceptance", p: "By creating an account or using NotRespond services, you agree to these Terms. If you do not agree, do not use the service." },
    { h: "2. The Service", p: "NotRespond provides cloud infrastructure — virtual machines, storage, networking, email, and related products — on a prepaid-credit basis. Features and pricing may change over time." },
    { h: "3. Accounts & Security", p: "You are responsible for activity under your account and for safeguarding your credentials and two-factor methods. Notify us promptly of any unauthorized access." },
    { h: "4. Billing & Credits", p: "Services are metered in prepaid credits and deducted while resources run. When your balance is exhausted, running resources may be suspended. Credits are non-transferable unless stated otherwise." },
    { h: "5. Acceptable Use", p: "You may not use the service for unlawful activity, to harm others, to send spam, to attack or disrupt third parties, or to violate the rights of others. We may act on credible abuse reports." },
    { h: "6. Suspension & Termination", p: "We may suspend or terminate accounts that breach these Terms or that present a security or legal risk. You may close your account at any time." },
    { h: "7. Disclaimers & Liability", p: "The service is provided “as is” without warranties to the extent permitted by law. Our liability is limited as set out in the finalized agreement." },
    { h: "8. Changes", p: "We may update these Terms; material changes will be announced. Continued use after changes take effect constitutes acceptance." },
    { h: "9. Contact", p: "Questions about these Terms: support@notrespond.com." },
];

export default function TermsPage() {
    return (
        <div style={{ paddingTop: "100px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: 780 }}>
                <div style={{ marginBottom: 28 }}>
                    <span className="badge badge-cyan" style={{ marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <FileText style={{ width: 14, height: 14 }} /> LEGAL
                    </span>
                    <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.75rem)", fontWeight: 800, letterSpacing: "-0.03em" }}>Terms of Service</h1>
                </div>

                <div className="glass-card" style={{ padding: "14px 18px", marginBottom: 28, display: "flex", gap: 10, alignItems: "flex-start", borderColor: "rgba(245,158,11,0.3)" }}>
                    <AlertTriangle style={{ width: 18, height: 18, color: "var(--accent-orange)", flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        <strong style={{ color: "var(--text-primary)" }}>Draft template.</strong> This is placeholder wording — review and finalize with legal counsel before relying on it.
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
