"use client";

import { useState } from "react";

const PROTOCOLS = [
    { id: "wireguard", name: "WireGuard", icon: "⚡", color: "var(--accent-cyan)" },
    { id: "openvpn", name: "OpenVPN", icon: "🔐", color: "var(--accent-green)" },
    { id: "ikev2", name: "IKEv2", icon: "📱", color: "var(--accent-purple)" },
];

const LOCATIONS = [
    { id: "us-east", name: "US East (New York)", flag: "🇺🇸" },
    { id: "us-west", name: "US West (Los Angeles)", flag: "🇺🇸" },
    { id: "eu-west", name: "EU West (London)", flag: "🇬🇧" },
    { id: "eu-central", name: "EU Central (Frankfurt)", flag: "🇩🇪" },
    { id: "ap-east", name: "Asia East (Tokyo)", flag: "🇯🇵" },
    { id: "ap-south", name: "Asia South (Singapore)", flag: "🇸🇬" },
];

interface GeneratedConfig {
    configData: string;
    protocol: string;
    serverLocation: string;
}

export default function VPNDashboard() {
    const [protocol, setProtocol] = useState("wireguard");
    const [location, setLocation] = useState("us-east");
    const [generating, setGenerating] = useState(false);
    const [config, setConfig] = useState<GeneratedConfig | null>(null);
    const [error, setError] = useState("");

    const handleGenerate = async () => {
        setGenerating(true);
        setError("");

        try {
            const res = await fetch("/api/vpn/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ protocol, serverLocation: location }),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Failed to generate config");
                return;
            }

            const data = await res.json();
            setConfig({
                configData: data.config.configData,
                protocol: data.config.protocol,
                serverLocation: data.config.serverLocation,
            });
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setGenerating(false);
        }
    };

    const downloadConfig = () => {
        if (!config) return;
        const ext = config.protocol === "wireguard" ? "conf" : "ovpn";
        const blob = new Blob([config.configData], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${config.protocol}-${config.serverLocation}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: "900px" }}>
                <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                    VPN Configuration <span className="gradient-text">Generator</span>
                </h1>
                <p style={{ color: "var(--text-muted)", marginBottom: "40px" }}>
                    Select a protocol and server location to generate your VPN config file.
                </p>

                {/* Protocol Selection */}
                <div style={{ marginBottom: "30px" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "12px" }}>
                        Protocol
                    </label>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                        {PROTOCOLS.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setProtocol(p.id)}
                                className="glass-card"
                                style={{
                                    padding: "16px 24px",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    flex: "1 1 150px",
                                    border: protocol === p.id ? `1px solid ${p.color}` : "1px solid var(--glass-border)",
                                    background: protocol === p.id ? `${p.color}08` : "var(--glass-bg)",
                                }}
                            >
                                <span style={{ fontSize: "1.3rem" }}>{p.icon}</span>
                                <span style={{ fontWeight: 600, color: protocol === p.id ? p.color : "var(--text-secondary)" }}>
                                    {p.name}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Location Selection */}
                <div style={{ marginBottom: "30px" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "12px" }}>
                        Server Location
                    </label>
                    <div className="grid-3" style={{ gap: "10px" }}>
                        {LOCATIONS.map((loc) => (
                            <button
                                key={loc.id}
                                onClick={() => setLocation(loc.id)}
                                className="glass-card"
                                style={{
                                    padding: "14px 18px",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    border: location === loc.id ? "1px solid var(--accent-cyan)" : "1px solid var(--glass-border)",
                                    background: location === loc.id ? "rgba(0,240,255,0.05)" : "var(--glass-bg)",
                                }}
                            >
                                <span style={{ fontSize: "1.3rem" }}>{loc.flag}</span>
                                <span style={{
                                    fontWeight: 500, fontSize: "0.85rem",
                                    color: location === loc.id ? "var(--accent-cyan)" : "var(--text-secondary)",
                                }}>
                                    {loc.name}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Generate Button */}
                <button
                    onClick={handleGenerate}
                    className="btn btn-primary"
                    disabled={generating}
                    style={{ padding: "14px 40px", marginBottom: "30px", opacity: generating ? 0.7 : 1 }}
                >
                    {generating ? "Generating..." : "⚡ Generate Config"}
                </button>

                {error && (
                    <div style={{
                        padding: "12px 16px", borderRadius: "8px",
                        background: "rgba(255,0,110,0.1)", border: "1px solid rgba(255,0,110,0.2)",
                        color: "var(--accent-magenta)", fontSize: "0.85rem", marginBottom: "20px",
                    }}>
                        {error}
                    </div>
                )}

                {/* Generated Config Display */}
                {config && (
                    <div className="glass-card animate-fade-in-up" style={{ padding: "0", overflow: "hidden" }}>
                        <div style={{
                            padding: "16px 24px",
                            borderBottom: "1px solid var(--glass-border)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}>
                            <div>
                                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Generated Configuration</span>
                                <span className="mono badge badge-green" style={{ marginLeft: "10px" }}>
                                    {config.protocol.toUpperCase()}
                                </span>
                            </div>
                            <button onClick={downloadConfig} className="btn btn-primary" style={{ padding: "8px 20px", fontSize: "0.82rem" }}>
                                ⬇ Download
                            </button>
                        </div>
                        <pre
                            className="mono"
                            style={{
                                padding: "20px 24px",
                                fontSize: "0.8rem",
                                lineHeight: 1.7,
                                color: "var(--text-secondary)",
                                background: "rgba(0,0,0,0.3)",
                                margin: 0,
                                overflow: "auto",
                                maxHeight: "400px",
                            }}
                        >
                            {config.configData}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
