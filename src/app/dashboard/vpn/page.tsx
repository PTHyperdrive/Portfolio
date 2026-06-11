"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    Shield, Plus, Trash2, Download, Copy, X,
    Smartphone, Laptop, Monitor, Check, QrCode,
} from "lucide-react";

interface WgPeer {
    id: string;
    name: string;
    assignedIp: string;
    allowedSubnets: string;
    active: boolean;
    createdAt: string;
}

interface NewPeerResult {
    peer: WgPeer;
    config: string;
    qrCode: string;
}

const DEVICE_ICONS: Record<string, typeof Smartphone> = {
    phone: Smartphone,
    laptop: Laptop,
    desktop: Monitor,
};

function guessIcon(name: string) {
    const lower = name.toLowerCase();
    if (lower.includes("phone") || lower.includes("iphone") || lower.includes("android") || lower.includes("mobile"))
        return Smartphone;
    if (lower.includes("laptop") || lower.includes("macbook") || lower.includes("notebook"))
        return Laptop;
    return Monitor;
}

export default function VPNDashboard() {
    const t = useThemeTokens();
    const [peers, setPeers] = useState<WgPeer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [peerName, setPeerName] = useState("");
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState("");
    const [newResult, setNewResult] = useState<NewPeerResult | null>(null);
    const [revoking, setRevoking] = useState("");
    const [copied, setCopied] = useState(false);
    const [showQr, setShowQr] = useState(false);

    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };

    const loadPeers = useCallback(async () => {
        try {
            const res = await fetch("/api/vpn/peers");
            if (res.ok) {
                const data = await res.json();
                setPeers(data.peers ?? []);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadPeers(); }, [loadPeers]);

    const handleCreate = async () => {
        if (!peerName.trim()) return;
        setCreating(true);
        setCreateError("");
        try {
            const res = await fetch("/api/vpn/peers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: peerName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setNewResult(data);
            setShowCreate(false);
            setPeerName("");
            loadPeers();
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : "Failed");
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (id: string) => {
        if (!confirm("Revoke this VPN peer? The config will stop working immediately.")) return;
        setRevoking(id);
        try {
            const res = await fetch(`/api/vpn/peers/${id}`, { method: "DELETE" });
            if (!res.ok) {
                const d = await res.json();
                alert(d.error || "Failed");
            } else {
                loadPeers();
            }
        } catch { alert("Failed to revoke"); }
        finally { setRevoking(""); }
    };

    const handleCopy = () => {
        if (!newResult) return;
        navigator.clipboard.writeText(newResult.config);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        if (!newResult) return;
        const blob = new Blob([newResult.config], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `wg-${newResult.peer.name.replace(/\s+/g, "-").toLowerCase()}.conf`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const inputStyle: React.CSSProperties = {
        width: "100%", padding: "10px 14px", borderRadius: t.isMono ? 0 : 8,
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        color: t.textPrimary, fontSize: "0.9rem", outline: "none", boxSizing: "border-box",
    };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                Dashboard <span>&bull;</span>
                <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>VPN Access</span>
            </p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Shield style={{ width: 22, height: 22, color: t.accentPrimary }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>VPN Access</h1>
                        <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Create WireGuard peers to securely connect to your VPC.</p>
                    </div>
                </div>
                <button
                    id="vpn-create"
                    onClick={() => setShowCreate(true)}
                    style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "9px 18px", borderRadius: t.isMono ? 0 : 8,
                        border: "none", background: t.accentPrimary, color: t.textInverse,
                        fontSize: "0.82rem", fontWeight: 700, cursor: "pointer",
                    }}
                >
                    <Plus style={{ width: 14, height: 14 }} /> New Peer
                </button>
            </div>

            {/* Info banner */}
            <div style={{
                ...card, padding: "14px 20px", marginBottom: 24,
                borderLeft: `3px solid ${t.statusWarning}`,
                display: "flex", alignItems: "center", gap: 10,
            }}>
                <Shield style={{ width: 16, height: 16, color: t.statusWarning, flexShrink: 0 }} />
                <p style={{ fontSize: "0.82rem", color: t.textSecondary, margin: 0 }}>
                    VPN configs contain your private key and are shown <strong>only once</strong> after creation.
                    Download or scan the QR code immediately. Max 3 active peers.
                </p>
            </div>

            {/* Peers Table */}
            <div style={card}>
                <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>My Peers</span>
                    <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: t.accentPrimaryMuted, color: t.accentPrimary }}>{peers.length}/3</span>
                </div>

                {loading ? (
                    <div style={{ padding: "48px 24px", textAlign: "center", color: t.textMuted }}>Loading…</div>
                ) : peers.length === 0 ? (
                    <div style={{ padding: "48px 24px", textAlign: "center" }}>
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                            <Shield style={{ width: 26, height: 26, color: t.accentPrimary }} />
                        </div>
                        <p style={{ fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>No VPN Peers</p>
                        <p style={{ fontSize: "0.83rem", color: t.textMuted, maxWidth: 360, margin: "0 auto" }}>
                            Create a WireGuard peer to securely access your server from any device.
                        </p>
                    </div>
                ) : (
                    peers.map((peer) => {
                        const Icon = guessIcon(peer.name);
                        let subnets: string[] = [];
                        try { subnets = JSON.parse(peer.allowedSubnets); } catch { subnets = []; }
                        return (
                            <div key={peer.id} style={{
                                padding: "16px 24px",
                                borderBottom: `1px solid ${t.borderSecondary}`,
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                    <div style={{ width: 38, height: 38, borderRadius: 10, background: t.bgSecondary, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Icon style={{ width: 18, height: 18, color: t.accentPrimary }} />
                                    </div>
                                    <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                            <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>{peer.name}</span>
                                            <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: t.statusSuccessBg, color: t.statusSuccess }}>ACTIVE</span>
                                        </div>
                                        <div style={{ fontSize: "0.75rem", color: t.textMuted, fontFamily: t.fontMono }}>
                                            {peer.assignedIp} &middot; {subnets.join(", ")} &middot; {new Date(peer.createdAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRevoke(peer.id)}
                                    disabled={revoking === peer.id}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 4,
                                        padding: "6px 12px", borderRadius: t.isMono ? 0 : 6,
                                        border: `1px solid ${t.statusError}33`, background: t.statusErrorBg,
                                        color: t.statusError, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                                        opacity: revoking === peer.id ? 0.5 : 1,
                                    }}
                                >
                                    <Trash2 style={{ width: 12, height: 12 }} />
                                    {revoking === peer.id ? "…" : "Revoke"}
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            {/* ─── Create Peer Modal ─── */}
            {showCreate && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: t.isLight ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                    <div style={{ ...card, width: "100%", maxWidth: 440, padding: 32 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                            <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: t.textPrimary }}>New VPN Peer</h2>
                            <button onClick={() => { setShowCreate(false); setCreateError(""); }} style={{ background: "none", border: "none", color: t.textMuted, cursor: "pointer" }}>
                                <X style={{ width: 18, height: 18 }} />
                            </button>
                        </div>

                        <p style={{ fontSize: "0.82rem", color: t.textMuted, marginBottom: 16 }}>
                            Give this peer a name to identify your device.
                        </p>

                        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                            {["Phone", "Laptop", "Desktop"].map((preset) => {
                                const PreIcon = DEVICE_ICONS[preset.toLowerCase()] || Monitor;
                                return (
                                    <button key={preset} onClick={() => setPeerName(preset)}
                                        style={{
                                            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                            padding: "8px 0", borderRadius: t.isMono ? 0 : 8,
                                            border: peerName === preset ? `2px solid ${t.accentPrimary}` : `1px solid ${t.borderPrimary}`,
                                            background: peerName === preset ? t.accentPrimaryMuted : "transparent",
                                            color: peerName === preset ? t.accentPrimary : t.textMuted,
                                            fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                                        }}
                                    >
                                        <PreIcon style={{ width: 14, height: 14 }} /> {preset}
                                    </button>
                                );
                            })}
                        </div>

                        <input
                            value={peerName}
                            onChange={(e) => setPeerName(e.target.value)}
                            placeholder="Custom name…"
                            maxLength={32}
                            style={{ ...inputStyle, marginBottom: 16 }}
                            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        />

                        {createError && <p style={{ color: t.statusError, fontSize: "0.82rem", marginBottom: 12 }}>{createError}</p>}

                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                            <button onClick={() => { setShowCreate(false); setCreateError(""); }}
                                style={{ padding: "9px 18px", borderRadius: t.isMono ? 0 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, cursor: "pointer", fontWeight: 600 }}>
                                Cancel
                            </button>
                            <button onClick={handleCreate} disabled={creating || !peerName.trim()}
                                style={{ padding: "9px 20px", borderRadius: t.isMono ? 0 : 8, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, cursor: "pointer", opacity: creating || !peerName.trim() ? 0.5 : 1 }}>
                                {creating ? "Generating…" : "Generate Peer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Config Result Modal (shown once) ─── */}
            {newResult && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: t.isLight ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                    <div style={{ ...card, width: "100%", maxWidth: 560, padding: 0, maxHeight: "90vh", overflow: "auto" }}>
                        {/* Header */}
                        <div style={{ padding: "20px 28px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: t.textPrimary, marginBottom: 2 }}>
                                    Peer Created: {newResult.peer.name}
                                </h2>
                                <p style={{ fontSize: "0.75rem", color: t.textMuted, fontFamily: t.fontMono }}>
                                    {newResult.peer.assignedIp}
                                </p>
                            </div>
                            <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: t.statusSuccessBg, color: t.statusSuccess }}>
                                ACTIVE
                            </span>
                        </div>

                        {/* Warning */}
                        <div style={{ padding: "12px 28px", background: `${t.statusWarning}0d`, borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 8 }}>
                            <Shield style={{ width: 14, height: 14, color: t.statusWarning, flexShrink: 0 }} />
                            <span style={{ fontSize: "0.78rem", color: t.statusWarning, fontWeight: 600 }}>
                                This config is shown ONLY ONCE. Download it now.
                            </span>
                        </div>

                        {/* Toggle: Config / QR */}
                        <div style={{ padding: "16px 28px 0", display: "flex", gap: 8 }}>
                            <button onClick={() => setShowQr(false)} style={{
                                padding: "6px 16px", borderRadius: t.isMono ? 0 : 6,
                                border: !showQr ? `2px solid ${t.accentPrimary}` : `1px solid ${t.borderPrimary}`,
                                background: !showQr ? t.accentPrimaryMuted : "transparent",
                                color: !showQr ? t.accentPrimary : t.textMuted,
                                fontWeight: 600, fontSize: "0.78rem", cursor: "pointer",
                            }}>
                                Config File
                            </button>
                            <button onClick={() => setShowQr(true)} style={{
                                padding: "6px 16px", borderRadius: t.isMono ? 0 : 6,
                                border: showQr ? `2px solid ${t.accentPrimary}` : `1px solid ${t.borderPrimary}`,
                                background: showQr ? t.accentPrimaryMuted : "transparent",
                                color: showQr ? t.accentPrimary : t.textMuted,
                                fontWeight: 600, fontSize: "0.78rem", cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 4,
                            }}>
                                <QrCode style={{ width: 13, height: 13 }} /> QR Code
                            </button>
                        </div>

                        {/* Content */}
                        <div style={{ padding: "16px 28px" }}>
                            {showQr ? (
                                <div style={{ textAlign: "center", padding: "16px 0" }}>
                                    <div style={{ background: "#fff", borderRadius: 12, display: "inline-block", padding: 16 }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={newResult.qrCode} alt="WireGuard QR Code" style={{ width: 280, height: 280, imageRendering: "pixelated" }} />
                                    </div>
                                    <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 12 }}>
                                        Open WireGuard app → <strong>+</strong> → <strong>Scan QR Code</strong>
                                    </p>
                                </div>
                            ) : (
                                <pre style={{
                                    padding: 16, borderRadius: t.isMono ? 0 : 8,
                                    background: t.bgSecondary, color: t.textSecondary,
                                    fontSize: "0.78rem", lineHeight: 1.7,
                                    fontFamily: t.fontMono, overflow: "auto",
                                    border: `1px solid ${t.borderSecondary}`,
                                    whiteSpace: "pre-wrap", wordBreak: "break-all",
                                }}>
                                    {newResult.config}
                                </pre>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{ padding: "0 28px 24px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button onClick={handleCopy} style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "9px 16px", borderRadius: t.isMono ? 0 : 8,
                                border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                color: copied ? t.statusSuccess : t.textSecondary,
                                fontWeight: 600, fontSize: "0.82rem", cursor: "pointer",
                            }}>
                                {copied ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                                {copied ? "Copied!" : "Copy"}
                            </button>
                            <button onClick={handleDownload} style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "9px 16px", borderRadius: t.isMono ? 0 : 8,
                                border: "none", background: t.accentPrimary, color: t.textInverse,
                                fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
                            }}>
                                <Download style={{ width: 14, height: 14 }} /> Download .conf
                            </button>
                            <button onClick={() => { setNewResult(null); setShowQr(false); }} style={{
                                padding: "9px 16px", borderRadius: t.isMono ? 0 : 8,
                                border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                color: t.textMuted, fontWeight: 600, fontSize: "0.82rem", cursor: "pointer",
                            }}>
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
