"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Shield, RefreshCw, Trash2, Users, Wifi } from "lucide-react";

interface DbPeer {
    id: string;
    name: string;
    assignedIp: string;
    allowedSubnets: string;
    active: boolean;
    createdAt: string;
    revokedAt: string | null;
    user: { id: string; name: string | null; email: string | null };
}

interface MtPeer {
    id: string;
    interface: string;
    publicKey: string;
    allowedAddress: string;
    comment: string;
    lastHandshake: string;
    rx: number;
    tx: number;
}

export default function AdminWireGuardPage() {
    const t = useThemeTokens();
    const [dbPeers, setDbPeers] = useState<DbPeer[]>([]);
    const [mtPeersCustomer, setMtPeersCustomer] = useState<MtPeer[]>([]);
    const [mtPeersRemote, setMtPeersRemote] = useState<MtPeer[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<"managed" | "remote" | "customer">("managed");
    const [revoking, setRevoking] = useState("");

    const card: React.CSSProperties = {
        background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius, boxShadow: t.shadow,
    };

    const loadData = useCallback(async () => {
        try {
            const [dbRes, mtRes] = await Promise.all([
                fetch("/api/admin/wireguard/peers"),
                fetch("/api/admin/wireguard/mikrotik"),
            ]);
            if (dbRes.ok) {
                const d = await dbRes.json();
                setDbPeers(d.peers ?? []);
            }
            if (mtRes.ok) {
                const d = await mtRes.json();
                setMtPeersCustomer(d.customerPeers ?? []);
                setMtPeersRemote(d.remotePeers ?? []);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleRevoke = async (id: string) => {
        if (!confirm("Revoke this peer? It will be removed from MikroTik immediately.")) return;
        setRevoking(id);
        try {
            const res = await fetch(`/api/vpn/peers/${id}`, { method: "DELETE" });
            if (!res.ok) { const d = await res.json(); alert(d.error || "Failed"); }
            else { loadData(); }
        } catch { alert("Failed"); }
        finally { setRevoking(""); }
    };

    const fmt = (bytes: number) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

    const tabStyle = (id: string): React.CSSProperties => ({
        padding: "8px 18px", borderRadius: t.cardRadius,
        border: tab === id ? `2px solid ${t.accentPrimary}` : `1px solid ${t.borderPrimary}`,
        background: tab === id ? t.accentPrimaryMuted : "transparent",
        color: tab === id ? t.accentPrimary : t.textMuted,
        fontWeight: 600, fontSize: "0.8rem", cursor: "pointer",
    });

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Admin <span>&bull;</span> Infrastructure <span>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>WireGuard</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Shield style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>WireGuard Peers</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>View all WireGuard peers across interfaces. Wireguard-VPN is read-only.</p>
                        </div>
                    </div>
                    <button onClick={loadData} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.cardRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                        <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                {[
                    { label: "Managed Peers", val: dbPeers.filter(p => p.active).length, color: t.accentPrimary },
                    { label: "Customers-WG1", val: mtPeersCustomer.length, color: t.statusSuccess },
                    { label: "Wireguard-VPN", val: mtPeersRemote.length, color: t.statusWarning },
                ].map(s => (
                    <div key={s.label} style={{ padding: "8px 18px", borderRadius: t.cardRadius, background: t.bgCard, border: `1px solid ${t.borderPrimary}`, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.72rem", color: t.textMuted, fontWeight: 600 }}>{s.label}</span>
                        <span style={{ fontSize: "1rem", fontWeight: 800, color: s.color, fontFamily: t.fontMono }}>{s.val}</span>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                <button onClick={() => setTab("managed")} style={tabStyle("managed")}>
                    <Users style={{ width: 13, height: 13, display: "inline", verticalAlign: -2, marginRight: 4 }} />
                    Website-Managed
                </button>
                <button onClick={() => setTab("remote")} style={tabStyle("remote")}>
                    <Shield style={{ width: 13, height: 13, display: "inline", verticalAlign: -2, marginRight: 4 }} />
                    Wireguard-VPN (Read-only)
                </button>
                <button onClick={() => setTab("customer")} style={tabStyle("customer")}>
                    <Wifi style={{ width: 13, height: 13, display: "inline", verticalAlign: -2, marginRight: 4 }} />
                    Customers-WG1 (MikroTik)
                </button>
            </div>

            {loading ? (
                <div style={{ ...card, padding: "48px 24px", textAlign: "center", color: t.textMuted }}>Loading…</div>
            ) : (
                <div style={card}>
                    {/* Managed Peers Tab */}
                    {tab === "managed" && (
                        <>
                            <div style={{ padding: "14px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>Website-Managed Peers (DB)</span>
                                <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: t.accentPrimaryMuted, color: t.accentPrimary }}>{dbPeers.length}</span>
                            </div>
                            {dbPeers.length === 0 ? (
                                <div style={{ padding: "40px 24px", textAlign: "center", color: t.textMuted, fontSize: "0.88rem" }}>No website-managed peers yet.</div>
                            ) : dbPeers.map(p => (
                                <div key={p.id} style={{ padding: "14px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                            <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.88rem" }}>{p.name}</span>
                                            <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: p.active ? t.statusSuccessBg : t.statusErrorBg, color: p.active ? t.statusSuccess : t.statusError }}>{p.active ? "ACTIVE" : "REVOKED"}</span>
                                        </div>
                                        <div style={{ fontSize: "0.73rem", color: t.textMuted, fontFamily: t.fontMono }}>
                                            {p.assignedIp} &middot; {p.user?.email || p.user?.name || "unknown"} &middot; {new Date(p.createdAt).toLocaleDateString()}
                                            {p.revokedAt && <> &middot; Revoked {new Date(p.revokedAt).toLocaleDateString()}</>}
                                        </div>
                                    </div>
                                    {p.active && (
                                        <button onClick={() => handleRevoke(p.id)} disabled={revoking === p.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 4, border: `1px solid ${t.statusError}33`, background: t.statusErrorBg, color: t.statusError, fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", opacity: revoking === p.id ? 0.5 : 1 }}>
                                            <Trash2 style={{ width: 11, height: 11 }} /> Revoke
                                        </button>
                                    )}
                                </div>
                            ))}
                        </>
                    )}

                    {/* Remote-WG1 Tab (Read-only) */}
                    {tab === "remote" && (
                        <>
                            <div style={{ padding: "14px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>Wireguard-VPN Peers</span>
                                    <span style={{ fontSize: "0.65rem", padding: "2px 6px", borderRadius: 4, background: t.statusWarningBg, color: t.statusWarning, fontWeight: 700 }}>READ-ONLY</span>
                                </div>
                                <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: t.statusWarningBg, color: t.statusWarning }}>{mtPeersRemote.length}</span>
                            </div>
                            {mtPeersRemote.length === 0 ? (
                                <div style={{ padding: "40px 24px", textAlign: "center", color: t.textMuted, fontSize: "0.88rem" }}>No peers on Wireguard-VPN.</div>
                            ) : mtPeersRemote.map(p => (
                                <div key={p.id} style={{ padding: "14px 24px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.88rem" }}>{p.comment || "Unnamed"}</span>
                                        <span style={{ fontSize: "0.65rem", fontFamily: t.fontMono, color: t.accentPrimary }}>{p.allowedAddress}</span>
                                    </div>
                                    <div style={{ fontSize: "0.73rem", color: t.textMuted, fontFamily: t.fontMono }}>
                                        Handshake: {p.lastHandshake || "never"} &middot; RX: {fmt(p.rx)} &middot; TX: {fmt(p.tx)}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}

                    {/* Customers-WG1 Tab (MikroTik raw) */}
                    {tab === "customer" && (
                        <>
                            <div style={{ padding: "14px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>Customers-WG1 Peers (MikroTik)</span>
                                <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: t.statusSuccessBg, color: t.statusSuccess }}>{mtPeersCustomer.length}</span>
                            </div>
                            {mtPeersCustomer.length === 0 ? (
                                <div style={{ padding: "40px 24px", textAlign: "center", color: t.textMuted, fontSize: "0.88rem" }}>No peers on Customers-WG1.</div>
                            ) : mtPeersCustomer.map(p => (
                                <div key={p.id} style={{ padding: "14px 24px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                        <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.88rem" }}>{p.comment || "Unnamed"}</span>
                                        <span style={{ fontSize: "0.65rem", fontFamily: t.fontMono, color: t.accentPrimary }}>{p.allowedAddress}</span>
                                    </div>
                                    <div style={{ fontSize: "0.73rem", color: t.textMuted, fontFamily: t.fontMono }}>
                                        Handshake: {p.lastHandshake || "never"} &middot; RX: {fmt(p.rx)} &middot; TX: {fmt(p.tx)}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
