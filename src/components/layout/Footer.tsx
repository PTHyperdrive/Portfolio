import Link from "next/link";
import Image from "next/image";

const FOOTER_LINKS = {
    Services: [
        { href: "/services/vps", label: "VPS Hosting" },
        { href: "/services/email", label: "Email Solutions" },
        { href: "/services/vpn", label: "VPN Access" },
        { href: "/services/proxy", label: "Proxy Accounts" },
    ],
    Company: [
        { href: "/about", label: "About" },
        { href: "/blog", label: "Blog" },
        { href: "/contact", label: "Contact" },
        { href: "/terms", label: "Terms of Service" },
        { href: "/privacy", label: "Privacy Policy" },
    ],
    Support: [
        { href: "/docs", label: "Documentation" },
        { href: "/faq", label: "FAQ" },
        { href: "/status", label: "System Status" },
        { href: "mailto:support@notrespond.com", label: "Email Support" },
    ],
};

export default function Footer() {
    return (
        <footer
            style={{
                position: "relative",
                zIndex: 1,
                borderTop: "1px solid var(--glass-border)",
                background: "rgba(10, 10, 15, 0.6)",
                backdropFilter: "blur(10px)",
            }}
        >
            <div className="container" style={{ padding: "60px 24px 30px" }}>
                {/* Footer Grid */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 1fr 1fr",
                        gap: "40px",
                        marginBottom: "50px",
                    }}
                    className="footer-grid"
                >
                    {/* Brand */}
                    <div>
                        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                            <Image
                                src="/logo.png"
                                alt="Notrespond.com"
                                width={120}
                                height={32}
                                style={{ objectFit: "contain" }}
                            />
                            <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)" }}>
                                Notrespond<span style={{ color: "var(--accent-cyan)" }}>.com</span>
                            </span>
                        </Link>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.7, maxWidth: "320px" }}>
                            Premium cloud infrastructure services. High-performance VPS, secure email, encrypted VPN, and reliable proxy solutions for professionals.
                        </p>
                        {/* Social Icons */}
                        <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
                            {["GitHub", "Discord", "Twitter"].map((social) => (
                                <a
                                    key={social}
                                    href="#"
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: "8px",
                                        background: "var(--glass-bg)",
                                        border: "1px solid var(--glass-border)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "var(--text-muted)",
                                        textDecoration: "none",
                                        fontSize: "0.7rem",
                                        fontWeight: 600,
                                        transition: "all 0.2s ease",
                                    }}
                                    title={social}
                                >
                                    {social[0]}
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Link Columns */}
                    {Object.entries(FOOTER_LINKS).map(([title, links]) => (
                        <div key={title}>
                            <h4 style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", marginBottom: "16px" }}>
                                {title}
                            </h4>
                            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
                                {links.map((link) => (
                                    <li key={link.href}>
                                        <Link
                                            href={link.href}
                                            style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.88rem", transition: "color 0.2s" }}
                                        >
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Bottom Bar */}
                <div
                    style={{
                        borderTop: "1px solid var(--glass-border)",
                        paddingTop: "24px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "12px",
                    }}
                >
                    <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                        © {new Date().getFullYear()} Notrespond.com. All rights reserved.
                    </p>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                        Built with <span style={{ color: "var(--accent-cyan)" }}>Next.js</span> • Secured with <span style={{ color: "var(--accent-green)" }}>❤️</span>
                    </p>
                </div>
            </div>

        </footer>
    );
}
