"use client";

import { useState } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Zap, Lock, Smartphone, Download, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const PROTOCOLS: { id: string; name: string; Icon: LucideIcon; color: string }[] = [
    { id: "wireguard", name: "WireGuard", Icon: Zap, color: "var(--accent-cyan)" },
    { id: "openvpn", name: "OpenVPN", Icon: Lock, color: "var(--accent-green)" },
    { id: "ikev2", name: "IKEv2", Icon: Smartphone, color: "var(--accent-purple)" },
];

const LOCATIONS = [
    { id: "us-east", name: "US East (New York)", code: "US" },
    { id: "us-west", name: "US West (Los Angeles)", code: "US" },
    { id: "eu-west", name: "EU West (London)", code: "GB" },
    { id: "eu-central", name: "EU Central (Frankfurt)", code: "DE" },
    { id: "ap-east", name: "Asia East (Tokyo)", code: "JP" },
    { id: "ap-south", name: "Asia South (Singapore)", code: "SG" },
];

interface GeneratedConfig {
    configData: string;
    protocol: string;
    serverLocation: string;
}

export default function VPNDashboard() {
    const t = useThemeTokens();
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

    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>

            {/* Breadcrumb */}
            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 24 }}>
                Dashboard &nbsp;&bull;&nbsp; VPN
            </p>

            <div style={{ maxWidth: 900 }}>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "8px", color: t.textPrimary }}>
                    VPN Configuration Generator
                </h1>
                <p style={{ color: t.textMuted, marginBottom: "40px", fontSize: "0.88rem" }}>
                    Select a protocol and server location to generate your VPN config file.
                </p>

                {/* Protocol Selection */}
                <div style={{ marginBottom: "30px" }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: t.textMuted, marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Protocol
                    </label>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                        {PROTOCOLS.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setProtocol(p.id)}
                                style={{
                                    ...card,
                                    padding: "16px 24px",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    flex: "1 1 150px",
                                    border: protocol === p.id ? `2px solid ${p.color}` : `1px solid ${t.borderPrimary}`,
                                    background: protocol === p.id ? `${p.color}0d` : t.bgCard,
                                }}
                            >
                                <p.Icon style={{ width: 20, height: 20, color: protocol === p.id ? p.color : t.textMuted }} />
                                <span style={{ fontWeight: 600, color: protocol === p.id ? p.color : t.textSecondary }}>
                                    {p.name}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Location Selection */}
                <div style={{ marginBottom: "30px" }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: t.textMuted, marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Server Location
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                        {LOCATIONS.map((loc) => (
                            <button
                                key={loc.id}
                                onClick={() => setLocation(loc.id)}
                                style={{
                                    ...card,
                                    padding: "14px 18px",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    border: location === loc.id ? `2px solid ${t.accentPrimary}` : `1px solid ${t.borderPrimary}`,
                                    background: location === loc.id ? t.accentPrimaryMuted : t.bgCard,
                                }}
                            >
                                <MapPin style={{ width: 14, height: 14, color: location === loc.id ? t.accentPrimary : t.textMuted, flexShrink: 0 }} />
                                <div style={{ textAlign: "left" }}>
                                    <span style={{
                                        fontWeight: 600, fontSize: "0.85rem",
                                        color: location === loc.id ? t.accentPrimary : t.textSecondary,
                                    }}>
                                        {loc.name}
                                    </span>
                                    <span style={{ fontSize: "0.7rem", color: t.textMuted, marginLeft: 6 }}>{loc.code}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Generate Button */}
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "14px 40px", marginBottom: "30px",
                        borderRadius: t.buttonRadius, border: "none",
                        background: t.accentPrimary, color: t.textInverse,
                        fontWeight: 700, fontSize: "0.9rem",
                        cursor: generating ? "not-allowed" : "pointer",
                        opacity: generating ? 0.7 : 1,
                    }}
                >
                    <Zap style={{ width: 16, height: 16 }} />
                    {generating ? "Generating..." : "Generate Config"}
                </button>

                {error && (
                    <div style={{
                        padding: "12px 16px", borderRadius: t.isMono ? 4 : 8,
                        background: t.statusErrorBg, border: `1px solid ${t.statusError}33`,
                        color: t.statusError, fontSize: "0.85rem", marginBottom: "20px",
                    }}>
                        {error}
                    </div>
                )}

                {/* Generated Config Display */}
                {config && (
                    <div style={{ ...card, overflow: "hidden" }}>
                        <div style={{
                            padding: "16px 24px",
                            borderBottom: `1px solid ${t.borderPrimary}`,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}>
                            <div>
                                <span style={{ fontWeight: 600, fontSize: "0.9rem", color: t.textPrimary }}>Generated Configuration</span>
                                <span style={{ marginLeft: 10, padding: "2px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: t.statusSuccessBg, color: t.statusSuccess, fontFamily: t.fontMono }}>
                                    {config.protocol.toUpperCase()}
                                </span>
                            </div>
                            <button onClick={downloadConfig} style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                padding: "8px 20px", borderRadius: t.buttonRadius, border: "none",
                                background: t.accentPrimary, color: t.textInverse,
                                fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
                            }}>
                                <Download style={{ width: 14, height: 14 }} />
                                Download
                            </button>
                        </div>
                        <pre
                            style={{
                                padding: "20px 24px",
                                fontSize: "0.8rem",
                                lineHeight: 1.7,
                                color: t.textSecondary,
                                background: t.bgSecondary,
                                margin: 0,
                                overflow: "auto",
                                maxHeight: "400px",
                                fontFamily: t.fontMono,
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
