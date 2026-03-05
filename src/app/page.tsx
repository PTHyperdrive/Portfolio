import Link from "next/link";

const SERVICES = [
  {
    title: "VPS Hosting",
    subtitle: "v-GPU • GPU • Cloud Server",
    description: "High-performance virtual private servers with optional GPU acceleration. Perfect for AI/ML workloads, rendering, and enterprise applications.",
    icon: "🖥️",
    href: "/services/vps",
    color: "var(--accent-cyan)",
    features: ["NVMe SSD Storage", "GPU Passthrough", "99.9% Uptime SLA", "DDoS Protection"],
  },
  {
    title: "Email Solutions",
    subtitle: "Postfix • Exchange",
    description: "Self-hosted email infrastructure with full control. Choose between Postfix for Linux-native performance or Exchange for enterprise features.",
    icon: "📧",
    href: "/services/email",
    color: "var(--accent-purple)",
    features: ["Custom Domains", "Spam Filtering", "Unlimited Aliases", "Encrypted Storage"],
  },
  {
    title: "VPN Access",
    subtitle: "WireGuard • OpenVPN • IKEv2",
    description: "Generate your own VPN configurations instantly. Multiple protocols, global server locations, and zero-log policy.",
    icon: "🔒",
    href: "/services/vpn",
    color: "var(--accent-green)",
    features: ["Config Generator", "Multi-Protocol", "Global Locations", "Kill Switch"],
  },
  {
    title: "Proxy Network",
    subtitle: "HTTP • SOCKS5 • Residential",
    description: "Premium proxy accounts with locations worldwide. Residential IPs, datacenter proxies, and rotating endpoints for any use case.",
    icon: "🌐",
    href: "/services/proxy",
    color: "var(--accent-magenta)",
    features: ["100+ Locations", "Rotating IPs", "API Access", "Bulk Pricing"],
  },
];

const STATS = [
  { value: "50+", label: "Server Locations" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "10K+", label: "Active Users" },
  { value: "24/7", label: "Support" },
];

export default function HomePage() {
  return (
    <>
      {/* ─── Hero Section ─────────────────────────────────────── */}
      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          paddingTop: "80px",
        }}
      >
        {/* Gradient Orbs */}
        <div
          style={{
            position: "absolute",
            width: "800px",
            height: "800px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0, 240, 255, 0.08) 0%, transparent 70%)",
            top: "-300px",
            right: "-200px",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%)",
            bottom: "-200px",
            left: "-100px",
            pointerEvents: "none",
          }}
        />

        <div className="container" style={{ textAlign: "center", position: "relative" }}>
          {/* Badge */}
          <div className="animate-fade-in" style={{ marginBottom: "24px" }}>
            <span className="badge badge-cyan" style={{ fontSize: "0.8rem", padding: "6px 18px" }}>
              ⚡ Infrastructure as a Service
            </span>
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-in-up"
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
              fontWeight: 800,
              lineHeight: 1.1,
              marginBottom: "24px",
              letterSpacing: "-0.03em",
            }}
          >
            Premium Cloud
            <br />
            <span className="gradient-text">Infrastructure</span>
            <br />
            Services
          </h1>

          {/* Subtitle */}
          <p
            className="animate-fade-in-up"
            style={{
              fontSize: "1.15rem",
              color: "var(--text-secondary)",
              maxWidth: "600px",
              margin: "0 auto 40px",
              lineHeight: 1.7,
              animationDelay: "0.2s",
            }}
          >
            High-performance VPS with GPU support, secure email hosting, encrypted VPN configurations, and a global proxy network — all from one platform.
          </p>

          {/* CTA Buttons */}
          <div
            className="animate-fade-in-up"
            style={{
              display: "flex",
              gap: "16px",
              justifyContent: "center",
              flexWrap: "wrap",
              animationDelay: "0.3s",
            }}
          >
            <Link href="/services/vps" className="btn btn-primary" style={{ padding: "14px 36px", fontSize: "1rem" }}>
              Explore Services
            </Link>
            <Link href="/auth/register" className="btn btn-secondary" style={{ padding: "14px 36px", fontSize: "1rem" }}>
              Get Started Free →
            </Link>
          </div>

          {/* Tech Stack Tags */}
          <div
            className="animate-fade-in"
            style={{
              marginTop: "60px",
              display: "flex",
              justifyContent: "center",
              gap: "8px",
              flexWrap: "wrap",
              animationDelay: "0.5s",
            }}
          >
            {["WireGuard", "OpenVPN", "NVIDIA GPU", "NVMe SSD", "Postfix", "SOCKS5"].map((tech) => (
              <span
                key={tech}
                className="mono"
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Stats Bar ────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--glass-border)", borderBottom: "1px solid var(--glass-border)", background: "rgba(255,255,255,0.01)" }}>
        <div className="container" style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", padding: "40px 24px" }}>
          {STATS.map((stat) => (
            <div key={stat.label} style={{ textAlign: "center", padding: "10px 20px" }}>
              <div className="gradient-text" style={{ fontSize: "2.2rem", fontWeight: 800, marginBottom: "4px" }}>
                {stat.value}
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Services Grid ────────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "60px" }}>
            <h2 style={{ fontSize: "2.5rem", fontWeight: 800, marginBottom: "16px" }}>
              Our <span className="gradient-text">Services</span>
            </h2>
            <p style={{ color: "var(--text-secondary)", maxWidth: "550px", margin: "0 auto", fontSize: "1.05rem" }}>
              Everything you need for your cloud infrastructure, all in one place.
            </p>
          </div>

          <div className="grid-2 stagger" style={{ gap: "24px" }}>
            {SERVICES.map((service) => (
              <Link
                key={service.title}
                href={service.href}
                className="glass-card"
                style={{
                  padding: "36px",
                  textDecoration: "none",
                  display: "block",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Gradient corner accent */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: "120px",
                    height: "120px",
                    background: `radial-gradient(circle at top right, ${service.color}10, transparent 70%)`,
                    pointerEvents: "none",
                  }}
                />

                <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>{service.icon}</div>
                <h3 style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                  {service.title}
                </h3>
                <p className="mono" style={{ fontSize: "0.78rem", color: service.color, marginBottom: "12px" }}>
                  {service.subtitle}
                </p>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem", lineHeight: 1.6, marginBottom: "20px" }}>
                  {service.description}
                </p>

                {/* Feature pills */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {service.features.map((f) => (
                    <span
                      key={f}
                      style={{
                        padding: "4px 12px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        background: `${service.color}10`,
                        color: service.color,
                        fontWeight: 500,
                      }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why Choose Us ────────────────────────────────────── */}
      <section className="section" style={{ background: "rgba(255,255,255,0.01)" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "60px" }}>
            <h2 style={{ fontSize: "2.5rem", fontWeight: 800, marginBottom: "16px" }}>
              Why <span className="gradient-text-secondary">Choose Us</span>
            </h2>
            <p style={{ color: "var(--text-secondary)", maxWidth: "500px", margin: "0 auto" }}>
              Built with security, performance, and reliability at the core.
            </p>
          </div>

          <div className="grid-3 stagger">
            {[
              {
                icon: "🛡️",
                title: "Security First",
                description: "Protection against SQLi, XSS, CSRF, brute-force, and more. All data encrypted at rest and in transit.",
              },
              {
                icon: "⚡",
                title: "Blazing Fast",
                description: "NVMe SSD storage, low-latency networks, and optimized infrastructure for maximum performance.",
              },
              {
                icon: "🔧",
                title: "Full Control",
                description: "Root access to your VPS, custom email domains, self-generated VPN configs, and flexible proxy options.",
              },
              {
                icon: "📊",
                title: "Real-Time Monitoring",
                description: "Dashboard with live metrics, usage tracking, and instant alerts for your services.",
              },
              {
                icon: "💰",
                title: "Competitive Pricing",
                description: "Transparent pricing with no hidden fees. Pay only for what you use with flexible plans.",
              },
              {
                icon: "🌍",
                title: "Global Network",
                description: "Data centers and proxy endpoints across 50+ locations, ensuring low latency worldwide.",
              },
            ].map((item) => (
              <div key={item.title} className="glass-card" style={{ padding: "30px", textAlign: "center" }}>
                <div style={{ fontSize: "2.2rem", marginBottom: "16px" }}>{item.icon}</div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "10px", color: "var(--text-primary)" }}>
                  {item.title}
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ──────────────────────────────────────── */}
      <section className="section">
        <div className="container" style={{ textAlign: "center" }}>
          <div
            className="glass-card"
            style={{
              padding: "60px 40px",
              borderImage: "var(--gradient-primary) 1",
              borderWidth: "1px",
              borderStyle: "solid",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(135deg, rgba(0,240,255,0.03) 0%, rgba(139,92,246,0.03) 100%)",
                pointerEvents: "none",
              }}
            />
            <h2 style={{ fontSize: "2.2rem", fontWeight: 800, marginBottom: "16px", position: "relative" }}>
              Ready to Get Started?
            </h2>
            <p style={{ color: "var(--text-secondary)", maxWidth: "500px", margin: "0 auto 30px", fontSize: "1.05rem", position: "relative" }}>
              Join thousands of users who trust our platform for their cloud infrastructure needs.
            </p>
            <div style={{ display: "flex", gap: "16px", justifyContent: "center", position: "relative" }}>
              <Link href="/auth/register" className="btn btn-primary" style={{ padding: "14px 40px", fontSize: "1rem" }}>
                Create Account
              </Link>
              <Link href="/services/vps" className="btn btn-secondary" style={{ padding: "14px 40px", fontSize: "1rem" }}>
                View Plans
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
