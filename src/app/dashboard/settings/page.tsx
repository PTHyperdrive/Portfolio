"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

type Tab = "profile" | "preferences" | "security";

export default function SettingsPage() {
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState<Tab>("profile");

    // Profile state
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [profileMsg, setProfileMsg] = useState("");
    const [pwdMsg, setPwdMsg] = useState("");
    const [saving, setSaving] = useState(false);

    // Preferences state
    const [language, setLanguage] = useState("en");
    const [network, setNetwork] = useState("auto");

    // Security state
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);

    const user = session?.user as Record<string, unknown> | undefined;

    useEffect(() => {
        if (session?.user) {
            setName((session.user.name as string) || "");
            setEmail((session.user.email as string) || "");
        }
    }, [session]);

    const handleProfileSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setProfileMsg("");
        try {
            const res = await fetch("/api/user/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email }),
            });
            const data = await res.json();
            setProfileMsg(res.ok ? "✅ Profile updated successfully." : `❌ ${data.error}`);
        } catch {
            setProfileMsg("❌ Network error. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setPwdMsg("");
        try {
            const res = await fetch("/api/user/password", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldPassword, newPassword }),
            });
            const data = await res.json();
            if (res.ok) {
                setPwdMsg("✅ Password updated successfully.");
                setOldPassword("");
                setNewPassword("");
            } else {
                setPwdMsg(`❌ ${data.error}`);
            }
        } catch {
            setPwdMsg("❌ Network error. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const registerDate = user?.createdAt
        ? new Date(user.createdAt as string).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : session?.user?.email
            ? "—"
            : "Loading...";

    const tabs: { id: Tab; label: string; icon: string }[] = [
        { id: "profile", label: "Profile", icon: "👤" },
        { id: "preferences", label: "Preferences", icon: "⚙️" },
        { id: "security", label: "Security", icon: "🔒" },
    ];

    const inputStyle: React.CSSProperties = {
        width: "100%",
        padding: "10px 14px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "var(--radius-sm)",
        color: "var(--text-primary)",
        fontSize: "0.9rem",
        outline: "none",
    };

    const labelStyle: React.CSSProperties = {
        display: "block",
        marginBottom: "6px",
        fontSize: "0.82rem",
        color: "var(--text-muted)",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
    };

    return (
        <div style={{ paddingTop: "120px", paddingBottom: "80px", minHeight: "100vh" }}>
            <div className="container" style={{ maxWidth: "800px" }}>
                {/* Header */}
                <div style={{ marginBottom: "40px" }}>
                    <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "8px" }}>
                        <span className="gradient-text">Settings</span>
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                        Manage your account, preferences, and security settings.
                    </p>
                </div>

                {/* Tab Bar */}
                <div style={{ display: "flex", gap: "4px", marginBottom: "32px", borderBottom: "1px solid var(--glass-border)", paddingBottom: "0" }}>
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: "10px 20px",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontSize: "0.9rem",
                                fontWeight: 600,
                                color: activeTab === tab.id ? "var(--accent-cyan)" : "var(--text-muted)",
                                borderBottom: activeTab === tab.id ? "2px solid var(--accent-cyan)" : "2px solid transparent",
                                marginBottom: "-1px",
                                transition: "all 0.2s ease",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                            }}
                        >
                            <span>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Profile Tab ─────────────────────────────────────────── */}
                {activeTab === "profile" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                        {/* Read-only info card */}
                        <div className="glass-card" style={{ padding: "24px" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "16px" }}>Account Information</h3>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                <div>
                                    <span style={labelStyle}>Member Since</span>
                                    <span style={{ fontSize: "0.95rem", color: "var(--text-primary)" }}>{registerDate}</span>
                                </div>
                                <div>
                                    <span style={labelStyle}>Account ID</span>
                                    <span className="mono" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{session?.user?.id ?? "—"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Avatar placeholder */}
                        <div className="glass-card" style={{ padding: "24px" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "16px" }}>Avatar</h3>
                            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                                <div style={{ width: 72, height: 72, borderRadius: "16px", background: "var(--gradient-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem", fontWeight: 800, color: "#fff" }}>
                                    {(session?.user?.name || session?.user?.email || "U")[0].toUpperCase()}
                                </div>
                                <div>
                                    <button disabled className="btn btn-secondary" style={{ opacity: 0.5, cursor: "not-allowed", fontSize: "0.85rem" }}>
                                        📷 Upload Photo
                                    </button>
                                    <p style={{ marginTop: "8px", fontSize: "0.78rem", color: "var(--text-muted)" }}>Custom avatar upload coming soon.</p>
                                </div>
                            </div>
                        </div>

                        {/* Update name & email */}
                        <form onSubmit={handleProfileSave} className="glass-card" style={{ padding: "24px" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "20px" }}>Update Profile</h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                <div>
                                    <label style={labelStyle}>Display Name</label>
                                    <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Your name" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Email Address</label>
                                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="your@email.com" />
                                </div>
                                {profileMsg && <p style={{ fontSize: "0.85rem", color: profileMsg.startsWith("✅") ? "var(--accent-green)" : "var(--accent-magenta)" }}>{profileMsg}</p>}
                                <button type="submit" disabled={saving} className="btn btn-primary" style={{ alignSelf: "flex-start", padding: "10px 28px" }}>
                                    {saving ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>

                        {/* Change password */}
                        <form onSubmit={handlePasswordSave} className="glass-card" style={{ padding: "24px" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "20px" }}>Change Password</h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                <div>
                                    <label style={labelStyle}>Current Password</label>
                                    <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} style={inputStyle} placeholder="••••••••" />
                                </div>
                                <div>
                                    <label style={labelStyle}>New Password</label>
                                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} placeholder="Min. 8 characters" />
                                </div>
                                {pwdMsg && <p style={{ fontSize: "0.85rem", color: pwdMsg.startsWith("✅") ? "var(--accent-green)" : "var(--accent-magenta)" }}>{pwdMsg}</p>}
                                <button type="submit" disabled={saving} className="btn btn-secondary" style={{ alignSelf: "flex-start", padding: "10px 28px" }}>
                                    {saving ? "Updating..." : "Update Password"}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ── Preferences Tab ─────────────────────────────────────── */}
                {activeTab === "preferences" && (
                    <div className="glass-card" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "28px" }}>
                        <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "4px" }}>Display & Network Preferences</h3>
                        <div>
                            <label style={labelStyle}>Website Language</label>
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                style={{ ...inputStyle, cursor: "pointer" }}
                            >
                                <option value="en">🇺🇸 English</option>
                                <option value="vi">🇻🇳 Vietnamese</option>
                                <option value="ja">🇯🇵 Japanese</option>
                            </select>
                            <p style={{ marginTop: "6px", fontSize: "0.78rem", color: "var(--text-muted)" }}>Full i18n support coming soon. Selection is saved but does not yet change the UI language.</p>
                        </div>
                        <div>
                            <label style={labelStyle}>Network Preference</label>
                            <select
                                value={network}
                                onChange={(e) => setNetwork(e.target.value)}
                                style={{ ...inputStyle, cursor: "pointer" }}
                            >
                                <option value="auto">Auto</option>
                                <option value="ipv4">IPv4 Only</option>
                                <option value="ipv6">IPv6 Only</option>
                            </select>
                        </div>
                        <button className="btn btn-primary" style={{ alignSelf: "flex-start", padding: "10px 28px" }}>
                            Save Preferences
                        </button>
                    </div>
                )}

                {/* ── Security Tab ─────────────────────────────────────────── */}
                {activeTab === "security" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                        {/* 2FA toggle */}
                        <div className="glass-card" style={{ padding: "28px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                <div>
                                    <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "4px" }}>Two-Factor Authentication</h3>
                                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                        Use Google Authenticator to add an extra layer of security.
                                    </p>
                                </div>
                                {/* Toggle */}
                                <button
                                    onClick={() => setTwoFAEnabled(!twoFAEnabled)}
                                    style={{
                                        width: 52,
                                        height: 28,
                                        borderRadius: 14,
                                        border: "none",
                                        cursor: "pointer",
                                        background: twoFAEnabled ? "var(--accent-cyan)" : "rgba(255,255,255,0.1)",
                                        position: "relative",
                                        transition: "background 0.25s",
                                        flexShrink: 0,
                                    }}
                                >
                                    <span style={{
                                        position: "absolute",
                                        top: 4,
                                        left: twoFAEnabled ? 26 : 4,
                                        width: 20,
                                        height: 20,
                                        borderRadius: "50%",
                                        background: "#fff",
                                        transition: "left 0.25s",
                                    }} />
                                </button>
                            </div>

                            {twoFAEnabled && (
                                <div style={{ marginTop: "24px", padding: "24px", borderRadius: "var(--radius-sm)", background: "rgba(0,240,255,0.04)", border: "1px solid rgba(0,240,255,0.12)", textAlign: "center" }}>
                                    {/* QR Code placeholder */}
                                    <div style={{ width: 160, height: 160, margin: "0 auto 16px", borderRadius: 12, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", border: "1px dashed rgba(255,255,255,0.15)" }}>
                                        📷
                                    </div>
                                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "8px" }}>
                                        Scan this QR code with <strong>Google Authenticator</strong>
                                    </p>
                                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                        QR code generation requires <code className="mono">speakeasy</code> — coming soon.
                                    </p>
                                    <div style={{ marginTop: "20px" }}>
                                        <input style={{ ...inputStyle, textAlign: "center", maxWidth: 200, margin: "0 auto" }} placeholder="Enter 6-digit code" maxLength={6} />
                                        <button disabled className="btn btn-primary" style={{ marginTop: "12px", opacity: 0.5, cursor: "not-allowed" }}>Verify & Enable</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sessions info */}
                        <div className="glass-card" style={{ padding: "28px" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "8px" }}>Active Sessions</h3>
                            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "16px" }}>
                                Session management and device list coming soon.
                            </p>
                            <div style={{ padding: "16px", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.03)", border: "1px solid var(--glass-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <p style={{ fontSize: "0.88rem", fontWeight: 600 }}>Current Session</p>
                                    <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>Web Browser · Active now</p>
                                </div>
                                <span className="badge badge-cyan" style={{ fontSize: "0.72rem" }}>Current</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
