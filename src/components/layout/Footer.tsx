"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Heart } from "lucide-react";

const FOOTER_LINKS = {
    Services: [
        { href: "/services/vps", label: "VPS Hosting" },
        { href: "/services/email", label: "Email Solutions" },
        { href: "/services/vpn", label: "VPN Access" },
        { href: "/services/mmo", label: "MMO Market" },
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
    const pathname = usePathname();
    const t = useThemeTokens();
    if (pathname.startsWith("/dashboard")) return null;

    return (
        <footer
            style={{
                position: "relative",
                zIndex: 1,
                borderTop: `1px solid ${t.borderPrimary}`,
                background: t.isMono
                    ? (t.isLight ? t.bgSecondary : t.bgSecondary)
                    : "rgba(10, 10, 15, 0.6)",
                backdropFilter: t.isMono ? "none" : "blur(10px)",
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
                                style={{ objectFit: "contain", width: "auto", height: "32px" }}
                            />
                            <span style={{ fontWeight: 700, fontSize: "1.1rem", color: t.textPrimary }}>
                                Notrespond<span style={{ color: t.accentPrimary }}>.com</span>
                            </span>
                        </Link>
                        <p style={{ color: t.textMuted, fontSize: "0.88rem", lineHeight: 1.7, maxWidth: "320px" }}>
                            Premium cloud infrastructure services. High-performance VPS, secure email, encrypted VPN, and digital asset marketplace for professionals.
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
                                        borderRadius: t.isMono ? 4 : 8,
                                        background: t.isMono ? "transparent" : t.bgCard,
                                        border: `1px solid ${t.borderPrimary}`,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: t.textMuted,
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
                            <h4 style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: t.textSecondary, marginBottom: "16px" }}>
                                {title}
                            </h4>
                            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
                                {links.map((link) => (
                                    <li key={link.href}>
                                        <Link
                                            href={link.href}
                                            style={{ color: t.textMuted, textDecoration: "none", fontSize: "0.88rem", transition: "color 0.2s" }}
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
                        borderTop: `1px solid ${t.borderPrimary}`,
                        paddingTop: "24px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "12px",
                    }}
                >
                    <p style={{ color: t.textMuted, fontSize: "0.82rem" }}>
                        © {new Date().getFullYear()} Notrespond.com. All rights reserved.
                    </p>
                    <p style={{ color: t.textMuted, fontSize: "0.82rem" }}>
                        Built with <span style={{ color: t.accentPrimary }}>Next.js</span> &bull; Secured with <Heart style={{ width: 13, height: 13, color: t.statusError, display: "inline", verticalAlign: "middle", fill: t.statusError }} />
                    </p>
                </div>
            </div>

        </footer>
    );
}
