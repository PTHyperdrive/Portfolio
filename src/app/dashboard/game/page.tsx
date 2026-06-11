"use client";

import { useState } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Gamepad2, Server, Cpu, HardDrive, Users, Plus, Search, RefreshCw } from "lucide-react";

const GAME_TEMPLATES = [
    { id: "minecraft", name: "Minecraft", engine: "Java / Bedrock", slots: "2–100 players", ram: "2–16 GB", icon: Gamepad2 },
    { id: "valheim", name: "Valheim", engine: "Unity", slots: "2–10 players", ram: "4–8 GB", icon: Server },
    { id: "terraria", name: "Terraria", engine: "XNA / .NET", slots: "2–16 players", ram: "1–4 GB", icon: Gamepad2 },
    { id: "csgo", name: "CS2 / CS:GO", engine: "Source 2", slots: "10–32 players", ram: "4–8 GB", icon: Server },
    { id: "ark", name: "ARK: Survival", engine: "Unreal Engine 4", slots: "2–70 players", ram: "8–32 GB", icon: Gamepad2 },
    { id: "rust", name: "Rust", engine: "Unity", slots: "2–250 players", ram: "8–16 GB", icon: Server },
];

export default function GameHostingPage() {
    const t = useThemeTokens();
    const [search, setSearch] = useState("");

    const filtered = GAME_TEMPLATES.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));
    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const inputStyle: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.isMono ? 0 : 8, color: t.textPrimary, fontSize: "0.875rem", outline: "none", padding: "9px 13px" };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Dashboard <span>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Game Hosting</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Gamepad2 style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Game Hosting</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Deploy game servers on LXC containers with pre-configured templates and auto-scaling.</p>
                        </div>
                    </div>
                    <button style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: "pointer" }}>
                        <Plus style={{ width: 14, height: 14 }} /> Deploy Server
                    </button>
                </div>
            </div>

            {/* Active Servers — Empty State */}
            <div style={{ ...card, marginBottom: 24 }}>
                <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Server style={{ width: 16, height: 16, color: t.accentPrimary }} />
                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>Active Servers</span>
                        <span style={{ padding: "2px 8px", borderRadius: 10, background: t.accentPrimaryMuted, color: t.accentPrimary, fontSize: "0.72rem", fontWeight: 700 }}>0</span>
                    </div>
                    <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: t.isMono ? 0 : 7, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                        <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
                    </button>
                </div>
                <div style={{ padding: "48px 24px", textAlign: "center" }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                        <Gamepad2 style={{ width: 28, height: 28, color: t.accentPrimary }} />
                    </div>
                    <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "1rem", marginBottom: 6 }}>No game servers deployed</p>
                    <p style={{ color: t.textMuted, fontSize: "0.875rem", maxWidth: 380, margin: "0 auto" }}>Select a game template below to deploy your first server.</p>
                </div>
            </div>

            {/* Game Templates */}
            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, color: t.textSecondary }}>Available Templates</h2>
                <div style={{ position: "relative", width: 260 }}>
                    <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: t.textMuted, pointerEvents: "none" }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search games..." style={{ ...inputStyle, width: "100%", paddingLeft: 32, boxSizing: "border-box" }} />
                </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                {filtered.map(game => (
                    <div key={game.id} style={{ ...card, padding: "22px 24px", cursor: "pointer", transition: "border-color 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = `${t.accentPrimary}55`)}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = t.borderPrimary)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <game.icon style={{ width: 18, height: 18, color: t.accentPrimary }} />
                            </div>
                            <div>
                                <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>{game.name}</p>
                                <p style={{ fontSize: "0.75rem", color: t.textMuted, fontFamily: t.fontMono }}>{game.engine}</p>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <Users style={{ width: 12, height: 12, color: t.textMuted }} />
                                <span style={{ fontSize: "0.78rem", color: t.textSecondary }}>{game.slots}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <Cpu style={{ width: 12, height: 12, color: t.textMuted }} />
                                <span style={{ fontSize: "0.78rem", color: t.textSecondary }}>{game.ram}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
