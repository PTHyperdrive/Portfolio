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

    // Security state — 2FA
    const [is2FAEnabled, setIs2FAEnabled] = useState(false);
    const [setupOpen, setSetupOpen] = useState(false);
    const [twoFALoading, setTwoFALoading] = useState(false);
    const [twoFAError, setTwoFAError] = useState("");
    const [qrCodeUrl, setQrCodeUrl] = useState("");
    const [manualSecret, setManualSecret] = useState("");
    const [totpToken, setTotpToken] = useState("");
    // Disable modal
    const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
    const [disableToken, setDisableToken] = useState("");
    const [disableLoading, setDisableLoading] = useState(false);
    const [disableError, setDisableError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const user = session?.user as Record<string, unknown> | undefined;

    // Sync toggle from session — runs once when session loads
    useEffect(() => {
        if (user?.twoFactorEnabled) {
            setIs2FAEnabled(true);
        }
    }, [user?.twoFactorEnabled]);

    // Toggle click — open setup if OFF, open disable modal if ON
    const handle2FAToggle = async () => {
        if (is2FAEnabled) {
            setIsDisableModalOpen(true);
            return;
        }
        // Start setup flow
        setSetupOpen(true);
        setTwoFALoading(true);
        setTwoFAError("");
        setTotpToken("");
        try {
            const res = await fetch("/api/auth/2fa/generate");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed to generate 2FA credentials");
            setQrCodeUrl(data.qrCodeUrl);
            setManualSecret(data.secret);
        } catch (err) {
            setTwoFAError(err instanceof Error ? err.message : "Failed to generate 2FA");
            setSetupOpen(false);
        } finally {
            setTwoFALoading(false);
        }
    };

    // Verify enable — POST 6-digit token, then flip toggle ON
    const handle2FAVerify = async () => {
        if (totpToken.length !== 6) return;
        setTwoFALoading(true);
        setTwoFAError("");
        try {
            const res = await fetch("/api/auth/2fa/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: totpToken }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Verification failed");
            setIs2FAEnabled(true);
            setSetupOpen(false);
            setQrCodeUrl("");
            setManualSecret("");
            setTotpToken("");
            setSuccessMsg("✅ Two-factor authentication enabled successfully.");
            setTimeout(() => setSuccessMsg(""), 4000);
        } catch (err) {
            setTwoFAError(err instanceof Error ? err.message : "Verification failed");
        } finally {
            setTwoFALoading(false);
        }
    };

    // Confirm disable — verify token, then flip toggle OFF
    const handle2FADisable = async () => {
        if (disableToken.length !== 6) return;
        setDisableLoading(true);
        setDisableError("");
        try {
            const res = await fetch("/api/auth/2fa/disable", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: disableToken }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed to disable 2FA");
            setIs2FAEnabled(false);
            setIsDisableModalOpen(false);
            setDisableToken("");
            setSuccessMsg("2FA has been disabled.");
            setTimeout(() => setSuccessMsg(""), 4000);
        } catch (err) {
            setDisableError(err instanceof Error ? err.message : "Failed to disable 2FA");
        } finally {
            setDisableLoading(false);
        }
    };

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
                        {/* 2FA */}
                        <div className="glass-card" style={{ padding: "28px" }}>

                            {/* Success / status toast */}
                            {successMsg && (
                                <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", fontSize: "0.86rem", fontWeight: 600 }}>
                                    {successMsg}
                                </div>
                            )}

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                <div>
                                    <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "4px" }}>Two-Factor Authentication</h3>
                                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                        Use Google Authenticator to add an extra layer of security.
                                    </p>
                                </div>
                                {/* Toggle */}
                                <button
                                    onClick={handle2FAToggle}
                                    disabled={twoFALoading}
                                    aria-label={is2FAEnabled ? "Disable 2FA" : "Enable 2FA"}
                                    style={{
                                        width: 52, height: 28, borderRadius: 14, border: "none",
                                        cursor: twoFALoading ? "not-allowed" : "pointer",
                                        background: is2FAEnabled ? "var(--accent-cyan)" : "rgba(255,255,255,0.1)",
                                        position: "relative", transition: "background 0.25s", flexShrink: 0,
                                        opacity: twoFALoading ? 0.6 : 1,
                                    }}
                                >
                                    <span style={{
                                        position: "absolute", top: 4,
                                        left: is2FAEnabled ? 26 : 4,
                                        width: 20, height: 20, borderRadius: "50%",
                                        background: "#fff", transition: "left 0.25s",
                                    }} />
                                </button>
                            </div>

                            {/* Enabled badge */}
                            {is2FAEnabled && !isDisableModalOpen && !setupOpen && (
                                <div style={{ padding: "14px 18px", borderRadius: 8, background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: "1.1rem" }}>🔐</span>
                                    <div>
                                        <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "#10b981" }}>2FA is active</p>
                                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>Click the toggle to disable and enter your authenticator code.</p>
                                    </div>
                                </div>
                            )}

                            {/* ── Setup flow (QR + verify) ── */}
                            {setupOpen && !is2FAEnabled && (
                                <div style={{ marginTop: "24px", padding: "24px", borderRadius: "var(--radius-sm)", background: "rgba(0,240,255,0.04)", border: "1px solid rgba(0,240,255,0.12)" }}>
                                    {twoFALoading && !qrCodeUrl && (
                                        <p style={{ textAlign: "center", fontSize: "0.9rem", color: "var(--text-muted)", padding: "20px 0" }}>Generating QR code…</p>
                                    )}
                                    {qrCodeUrl && (
                                        <>
                                            <div style={{ textAlign: "center", marginBottom: "20px" }}>
                                                <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>Step 1 — Scan with your authenticator app</p>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={qrCodeUrl} alt="2FA QR Code" width={192} height={192} style={{ margin: "0 auto", borderRadius: 12, background: "#111", display: "block" }} />
                                            </div>
                                            {manualSecret && (
                                                <div style={{ textAlign: "center", marginBottom: "24px" }}>
                                                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px" }}>Or enter this key manually:</p>
                                                    <code className="mono" style={{ display: "inline-block", padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--accent-cyan)", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.1em", userSelect: "all" }}>
                                                        {manualSecret}
                                                    </code>
                                                </div>
                                            )}
                                            <div style={{ textAlign: "center" }}>
                                                <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>Step 2 — Enter the 6-digit code to confirm</p>
                                                <input
                                                    value={totpToken}
                                                    onChange={e => { setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6)); setTwoFAError(""); }}
                                                    style={{ ...inputStyle, textAlign: "center", maxWidth: 200, margin: "0 auto", fontSize: "1.2rem", letterSpacing: "0.3em", fontWeight: 700 }}
                                                    placeholder="000000"
                                                    maxLength={6}
                                                    inputMode="numeric"
                                                    autoComplete="one-time-code"
                                                />
                                                {twoFAError && <p style={{ fontSize: "0.82rem", color: "var(--accent-magenta)", marginTop: "8px" }}>❌ {twoFAError}</p>}
                                                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
                                                    <button
                                                        onClick={() => { setSetupOpen(false); setQrCodeUrl(""); setManualSecret(""); setTotpToken(""); setTwoFAError(""); }}
                                                        className="btn btn-secondary"
                                                        style={{ padding: "10px 20px" }}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={handle2FAVerify}
                                                        disabled={twoFALoading || totpToken.length !== 6}
                                                        className="btn btn-primary"
                                                        style={{ padding: "10px 28px", opacity: totpToken.length !== 6 ? 0.5 : 1, cursor: totpToken.length !== 6 || twoFALoading ? "not-allowed" : "pointer" }}
                                                    >
                                                        {twoFALoading ? "Verifying…" : "Verify & Enable"}
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ── Disable modal (inline) ── */}
                            {isDisableModalOpen && (
                                <div style={{ marginTop: "20px", padding: "24px", borderRadius: "var(--radius-sm)", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.25)" }}>
                                    <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "#f87171", marginBottom: "6px" }}>⚠️ Disable Two-Factor Authentication</p>
                                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "20px" }}>
                                        To disable 2FA, please enter the 6-digit code from your authenticator app.
                                    </p>
                                    <div style={{ textAlign: "center" }}>
                                        <input
                                            value={disableToken}
                                            onChange={e => { setDisableToken(e.target.value.replace(/\D/g, "").slice(0, 6)); setDisableError(""); }}
                                            style={{ ...inputStyle, textAlign: "center", maxWidth: 200, margin: "0 auto", fontSize: "1.2rem", letterSpacing: "0.3em", fontWeight: 700 }}
                                            placeholder="000000"
                                            maxLength={6}
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            autoFocus
                                        />
                                        {disableError && <p style={{ fontSize: "0.82rem", color: "#f87171", marginTop: "8px" }}>❌ {disableError}</p>}
                                        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
                                            <button
                                                onClick={() => { setIsDisableModalOpen(false); setDisableToken(""); setDisableError(""); }}
                                                className="btn btn-secondary"
                                                style={{ padding: "10px 20px" }}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handle2FADisable}
                                                disabled={disableLoading || disableToken.length !== 6}
                                                style={{
                                                    padding: "10px 24px", borderRadius: 8, border: "none",
                                                    background: disableToken.length === 6 && !disableLoading ? "#ef4444" : "rgba(239,68,68,0.3)",
                                                    color: "#fff", fontWeight: 700, fontSize: "0.9rem",
                                                    cursor: disableToken.length !== 6 || disableLoading ? "not-allowed" : "pointer",
                                                    transition: "background 0.2s",
                                                }}
                                            >
                                                {disableLoading ? "Disabling…" : "Confirm Disable"}
                                            </button>
                                        </div>
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
