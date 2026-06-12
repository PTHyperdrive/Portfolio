"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { UAParser } from "ua-parser-js";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    User, Settings, Lock, ShieldCheck, Camera, AlertTriangle,
    XCircle, CheckCircle, RefreshCw, Mail
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Tab = "profile" | "preferences" | "security";
type FeedbackMsg = { type: "success" | "error"; text: string } | null;

interface DeviceSession {
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    lastActive: string;
    createdAt: string;
}

export default function AccountSettingsView() {
    const { data: session } = useSession();
    const t = useThemeTokens();
    const [activeTab, setActiveTab] = useState<Tab>("profile");

    // Profile state
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [profileMsg, setProfileMsg] = useState<FeedbackMsg>(null);
    const [pwdMsg, setPwdMsg] = useState<FeedbackMsg>(null);
    const [saving, setSaving] = useState(false);

    // Preferences state
    const [language, setLanguage] = useState("en");
    const [network, setNetwork] = useState("auto");

    // Security state — 2FA
    const [is2FAEnabled, setIs2FAEnabled] = useState(false);
    // Email-code 2FA
    const [isEmail2FAEnabled, setIsEmail2FAEnabled] = useState(false);
    const [emailSetupSent, setEmailSetupSent] = useState(false);
    const [emailSetupCode, setEmailSetupCode] = useState("");
    const [emailBusy, setEmailBusy] = useState(false);
    const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
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

    // Sync toggle from DB on mount — session JWT does not carry twoFactorEnabled
    useEffect(() => {
        fetch("/api/overview")
            .then(r => r.json())
            .then((d: { user?: { twoFactorEnabled?: boolean; emailTwoFactorEnabled?: boolean } }) => {
                if (d?.user?.twoFactorEnabled) {
                    setIs2FAEnabled(true);
                }
                if (d?.user?.emailTwoFactorEnabled) {
                    setIsEmail2FAEnabled(true);
                }
            })
            .catch(() => { /* non-critical — toggle stays off */ });
    }, []);

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
            setSuccessMsg("Two-factor authentication enabled successfully.");
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

    // ── Active Sessions state ─────────────────────────────────────────
    const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const formatUserAgent = (uaString: string): string => {
        if (!uaString) return "Unknown Device";
        const parser = new UAParser(uaString);
        const browser = parser.getBrowser().name ?? "Unknown Browser";
        const os = parser.getOS().name ?? "Unknown OS";
        return `${browser} on ${os}`;
    };

    const loadSessions = () => {
        setSessionsLoading(true);
        fetch("/api/user/sessions")
            .then(r => r.json())
            .then((d: { sessions?: DeviceSession[] }) => {
                setDeviceSessions(d.sessions ?? []);
            })
            .catch(() => { /* non-critical */ })
            .finally(() => setSessionsLoading(false));
    };

    // Load sessions when the Security tab is opened
    useEffect(() => {
        if (activeTab === "security") loadSessions();
    }, [activeTab]);


    const handleRevokeSession = async (id: string) => {
        setRevokingId(id);
        try {
            const res = await fetch(`/api/user/sessions/${id}`, { method: "DELETE" });
            if (res.ok) {
                setDeviceSessions(prev => prev.filter(s => s.id !== id));
            }
        } catch { /* non-critical */ } finally {
            setRevokingId(null);
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
        setProfileMsg(null);
        try {
            const res = await fetch("/api/user/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email }),
            });
            const data = await res.json();
            setProfileMsg(res.ok
                ? { type: "success", text: "Profile updated successfully." }
                : { type: "error", text: data.error }
            );
        } catch {
            setProfileMsg({ type: "error", text: "Network error. Please try again." });
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setPwdMsg(null);
        try {
            const res = await fetch("/api/user/password", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldPassword, newPassword }),
            });
            const data = await res.json();
            if (res.ok) {
                setPwdMsg({ type: "success", text: "Password updated successfully." });
                setOldPassword("");
                setNewPassword("");
            } else {
                setPwdMsg({ type: "error", text: data.error });
            }
        } catch {
            setPwdMsg({ type: "error", text: "Network error. Please try again." });
        } finally {
            setSaving(false);
        }
    };

    const registerDate = user?.createdAt
        ? new Date(user.createdAt as string).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : session?.user?.email
            ? "—"
            : "Loading...";

    const tabs: { id: Tab; label: string; Icon: LucideIcon }[] = [
        { id: "profile", label: "Profile", Icon: User },
        { id: "preferences", label: "Preferences", Icon: Settings },
        { id: "security", label: "Security", Icon: Lock },
    ];

    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };

    const inputStyle: React.CSSProperties = {
        width: "100%",
        padding: "10px 14px",
        background: t.bgInput,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        color: t.textPrimary,
        fontSize: "0.9rem",
        outline: "none",
        fontFamily: "inherit",
    };

    const labelStyle: React.CSSProperties = {
        display: "block",
        marginBottom: "6px",
        fontSize: "0.82rem",
        color: t.textMuted,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
    };

    const feedbackLine = (msg: FeedbackMsg) => {
        if (!msg) return null;
        const isOk = msg.type === "success";
        return (
            <p style={{ fontSize: "0.85rem", color: isOk ? t.statusSuccess : t.statusError, display: "flex", alignItems: "center", gap: 6 }}>
                {isOk
                    ? <CheckCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                    : <XCircle style={{ width: 14, height: 14, flexShrink: 0 }} />}
                {msg.text}
            </p>
        );
    };

    return (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
                {/* Header */}
                <div style={{ marginBottom: "40px" }}>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "8px", color: t.textPrimary }}>
                        Settings
                    </h1>
                    <p style={{ color: t.textMuted, fontSize: "0.88rem" }}>
                        Manage your account, preferences, and security settings.
                    </p>
                </div>

                {/* Tab Bar */}
                <div style={{ display: "flex", gap: "4px", marginBottom: "32px", borderBottom: `1px solid ${t.borderPrimary}`, paddingBottom: "0" }}>
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
                                color: activeTab === tab.id ? t.accentPrimary : t.textMuted,
                                borderBottom: activeTab === tab.id ? `2px solid ${t.accentPrimary}` : "2px solid transparent",
                                marginBottom: "-1px",
                                transition: "all 0.2s ease",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                            }}
                        >
                            <tab.Icon style={{ width: 15, height: 15 }} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Profile Tab ─────────────────────────────────────────── */}
                {activeTab === "profile" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                        {/* Read-only info card */}
                        <div style={{ ...card, padding: "24px" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "16px", color: t.textPrimary }}>Account Information</h3>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                <div>
                                    <span style={labelStyle}>Member Since</span>
                                    <span style={{ fontSize: "0.95rem", color: t.textPrimary }}>{registerDate}</span>
                                </div>
                                <div>
                                    <span style={labelStyle}>Account ID</span>
                                    <span style={{ fontSize: "0.8rem", color: t.textMuted, fontFamily: t.fontMono }}>{session?.user?.id ?? "—"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Avatar placeholder */}
                        <div style={{ ...card, padding: "24px" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "16px", color: t.textPrimary }}>Avatar</h3>
                            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                                <div style={{ width: 72, height: 72, borderRadius: t.cardRadius, background: t.isMono ? t.bgTertiary : "linear-gradient(135deg, #3b82f6, #6366f1)", border: t.isMono ? `1px solid ${t.borderPrimary}` : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem", fontWeight: 800, color: t.isLight ? t.textPrimary : "#fff" }}>
                                    {(session?.user?.name || session?.user?.email || "U")[0].toUpperCase()}
                                </div>
                                <div>
                                    <button disabled style={{
                                        display: "inline-flex", alignItems: "center", gap: 8,
                                        padding: "8px 18px", borderRadius: t.buttonRadius,
                                        border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                        color: t.textMuted, fontSize: "0.85rem", fontWeight: 600,
                                        opacity: 0.5, cursor: "not-allowed",
                                    }}>
                                        <Camera style={{ width: 14, height: 14 }} />
                                        Upload Photo
                                    </button>
                                    <p style={{ marginTop: "8px", fontSize: "0.78rem", color: t.textMuted }}>Custom avatar upload coming soon.</p>
                                </div>
                            </div>
                        </div>

                        {/* Update name & email */}
                        <form onSubmit={handleProfileSave} style={{ ...card, padding: "24px" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "20px", color: t.textPrimary }}>Update Profile</h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                <div>
                                    <label style={labelStyle}>Display Name</label>
                                    <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Your name" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Email Address</label>
                                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="your@email.com" />
                                </div>
                                {feedbackLine(profileMsg)}
                                <button type="submit" disabled={saving} style={{
                                    alignSelf: "flex-start", padding: "10px 28px", borderRadius: t.buttonRadius,
                                    border: "none", background: t.accentPrimary, color: t.textInverse,
                                    fontWeight: 700, fontSize: "0.875rem", cursor: saving ? "not-allowed" : "pointer",
                                }}>
                                    {saving ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>

                        {/* Change password */}
                        <form onSubmit={handlePasswordSave} style={{ ...card, padding: "24px" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "20px", color: t.textPrimary }}>Change Password</h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                <div>
                                    <label style={labelStyle}>Current Password</label>
                                    <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} style={inputStyle} placeholder="••••••••" />
                                </div>
                                <div>
                                    <label style={labelStyle}>New Password</label>
                                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} placeholder="Min. 8 characters" />
                                </div>
                                {feedbackLine(pwdMsg)}
                                <button type="submit" disabled={saving} style={{
                                    alignSelf: "flex-start", padding: "10px 28px", borderRadius: t.buttonRadius,
                                    border: `1px solid ${t.accentPrimary}`, background: "transparent",
                                    color: t.accentPrimary, fontWeight: 700, fontSize: "0.875rem",
                                    cursor: saving ? "not-allowed" : "pointer",
                                }}>
                                    {saving ? "Updating..." : "Update Password"}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ── Preferences Tab ─────────────────────────────────────── */}
                {activeTab === "preferences" && (
                    <>
                    <div style={{ ...card, padding: "32px", display: "flex", flexDirection: "column", gap: "28px" }}>
                        <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "4px", color: t.textPrimary }}>Display & Network Preferences</h3>
                        <div>
                            <label style={labelStyle}>Website Language</label>
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                style={{ ...inputStyle, cursor: "pointer" }}
                            >
                                <option value="en">English (US)</option>
                                <option value="vi">Vietnamese</option>
                                <option value="ja">Japanese</option>
                            </select>
                            <p style={{ marginTop: "6px", fontSize: "0.78rem", color: t.textMuted }}>Full i18n support coming soon. Selection is saved but does not yet change the UI language.</p>
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
                        <button style={{
                            alignSelf: "flex-start", padding: "10px 28px", borderRadius: t.buttonRadius,
                            border: "none", background: t.accentPrimary, color: t.textInverse,
                            fontWeight: 700, fontSize: "0.875rem", cursor: "pointer",
                        }}>
                            Save Preferences
                        </button>
                    </div>

                    {/* Email verification codes (2FA method) */}
                    <div style={{ ...card, padding: "28px", marginTop: 24 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                            <div>
                                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "4px", color: t.textPrimary, display: "flex", alignItems: "center", gap: 8 }}>
                                    <Mail style={{ width: 18, height: 18, color: t.accentPrimary }} />
                                    Email verification codes
                                    {isEmail2FAEnabled && (
                                        <span style={{ fontSize: "0.62rem", fontWeight: 800, padding: "2px 8px", borderRadius: t.buttonRadius, background: t.statusSuccessBg, color: t.statusSuccess }}>ENABLED</span>
                                    )}
                                </h3>
                                <p style={{ fontSize: "0.82rem", color: t.textMuted, maxWidth: 460 }}>
                                    Receive a 6-digit code by email at sign-in. Works on its own or alongside your authenticator app — at login you can pick whichever method you prefer.
                                </p>
                            </div>
                            {isEmail2FAEnabled && (
                                <button
                                    onClick={async () => {
                                        setEmailBusy(true); setEmailMsg(null);
                                        try {
                                            const res = await fetch("/api/auth/2fa/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disable" }) });
                                            if (res.ok) { setIsEmail2FAEnabled(false); setEmailSetupSent(false); setEmailSetupCode(""); }
                                            else { const d = await res.json(); setEmailMsg({ ok: false, text: d.error || "Failed" }); }
                                        } catch { setEmailMsg({ ok: false, text: "Network error" }); } finally { setEmailBusy(false); }
                                    }}
                                    disabled={emailBusy}
                                    style={{ padding: "8px 16px", borderRadius: t.buttonRadius, border: `1px solid ${t.statusError}`, background: "transparent", color: t.statusError, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                                >
                                    Disable
                                </button>
                            )}
                        </div>

                        {!isEmail2FAEnabled && (
                            <div style={{ marginTop: 16 }}>
                                {!emailSetupSent ? (
                                    <button
                                        onClick={async () => {
                                            setEmailBusy(true); setEmailMsg(null);
                                            try {
                                                const res = await fetch("/api/auth/2fa/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setup" }) });
                                                const d = await res.json();
                                                if (res.ok) { setEmailSetupSent(true); setEmailMsg({ ok: true, text: "Code sent — check your email." }); }
                                                else setEmailMsg({ ok: false, text: d.error || "Failed to send code" });
                                            } catch { setEmailMsg({ ok: false, text: "Network error" }); } finally { setEmailBusy(false); }
                                        }}
                                        disabled={emailBusy}
                                        style={{ padding: "10px 22px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", opacity: emailBusy ? 0.6 : 1 }}
                                    >
                                        {emailBusy ? "Sending…" : "Send setup code"}
                                    </button>
                                ) : (
                                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                        <input
                                            value={emailSetupCode}
                                            onChange={(e) => setEmailSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                            placeholder="123456"
                                            inputMode="numeric"
                                            style={{ ...inputStyle, width: 140, letterSpacing: "0.3em", textAlign: "center", fontFamily: t.fontMono }}
                                        />
                                        <button
                                            onClick={async () => {
                                                if (!/^\d{6}$/.test(emailSetupCode)) { setEmailMsg({ ok: false, text: "Enter the 6-digit code." }); return; }
                                                setEmailBusy(true); setEmailMsg(null);
                                                try {
                                                    const res = await fetch("/api/auth/2fa/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", code: emailSetupCode }) });
                                                    const d = await res.json();
                                                    if (res.ok) { setIsEmail2FAEnabled(true); setEmailSetupSent(false); setEmailSetupCode(""); setEmailMsg({ ok: true, text: "Email codes enabled." }); }
                                                    else setEmailMsg({ ok: false, text: d.error || "Invalid code" });
                                                } catch { setEmailMsg({ ok: false, text: "Network error" }); } finally { setEmailBusy(false); }
                                            }}
                                            disabled={emailBusy}
                                            style={{ padding: "10px 20px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", opacity: emailBusy ? 0.6 : 1 }}
                                        >
                                            {emailBusy ? "Verifying…" : "Verify & enable"}
                                        </button>
                                    </div>
                                )}
                                {emailMsg && (
                                    <p style={{ fontSize: "0.8rem", marginTop: 10, fontWeight: 600, color: emailMsg.ok ? t.statusSuccess : t.statusError }}>{emailMsg.text}</p>
                                )}
                            </div>
                        )}
                    </div>
                    </>
                )}

                {/* ── Security Tab ─────────────────────────────────────────── */}
                {activeTab === "security" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                        {/* 2FA */}
                        <div style={{ ...card, padding: "28px" }}>

                            {/* Success / status toast */}
                            {successMsg && (
                                <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: t.cardRadius, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}4d`, color: t.statusSuccess, fontSize: "0.86rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                                    <CheckCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                                    {successMsg}
                                </div>
                            )}

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                                <div>
                                    <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "4px", color: t.textPrimary }}>Two-Factor Authentication</h3>
                                    <p style={{ fontSize: "0.85rem", color: t.textMuted }}>
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
                                        background: is2FAEnabled ? t.accentPrimary : `${t.textMuted}33`,
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
                                <div style={{ padding: "14px 18px", borderRadius: t.cardRadius, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, display: "flex", alignItems: "center", gap: 10 }}>
                                    <ShieldCheck style={{ width: 22, height: 22, color: t.statusSuccess, flexShrink: 0 }} />
                                    <div>
                                        <p style={{ fontSize: "0.88rem", fontWeight: 700, color: t.statusSuccess }}>2FA is active</p>
                                        <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 2 }}>Click the toggle to disable and enter your authenticator code.</p>
                                    </div>
                                </div>
                            )}

                            {/* ── Setup flow (QR + verify) ── */}
                            {setupOpen && !is2FAEnabled && (
                                <div style={{ marginTop: "24px", padding: "24px", borderRadius: t.cardRadius, background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}1f` }}>
                                    {twoFALoading && !qrCodeUrl && (
                                        <p style={{ textAlign: "center", fontSize: "0.9rem", color: t.textMuted, padding: "20px 0" }}>Generating QR code…</p>
                                    )}
                                    {qrCodeUrl && (
                                        <>
                                            <div style={{ textAlign: "center", marginBottom: "20px" }}>
                                                <p style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>Step 1 — Scan with your authenticator app</p>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={qrCodeUrl} alt="2FA QR Code" width={192} height={192} style={{ margin: "0 auto", borderRadius: 12, background: "#111", display: "block" }} />
                                            </div>
                                            {manualSecret && (
                                                <div style={{ textAlign: "center", marginBottom: "24px" }}>
                                                    <p style={{ fontSize: "0.75rem", color: t.textMuted, marginBottom: "6px" }}>Or enter this key manually:</p>
                                                    <code style={{ display: "inline-block", padding: "8px 16px", borderRadius: 8, background: t.bgInput, border: `1px solid ${t.borderPrimary}`, color: t.accentPrimary, fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.1em", userSelect: "all", fontFamily: t.fontMono }}>
                                                        {manualSecret}
                                                    </code>
                                                </div>
                                            )}
                                            <div style={{ textAlign: "center" }}>
                                                <p style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>Step 2 — Enter the 6-digit code to confirm</p>
                                                <input
                                                    value={totpToken}
                                                    onChange={e => { setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6)); setTwoFAError(""); }}
                                                    style={{ ...inputStyle, textAlign: "center", maxWidth: 200, margin: "0 auto", fontSize: "1.2rem", letterSpacing: "0.3em", fontWeight: 700 }}
                                                    placeholder="000000"
                                                    maxLength={6}
                                                    inputMode="numeric"
                                                    autoComplete="one-time-code"
                                                />
                                                {twoFAError && (
                                                    <p style={{ fontSize: "0.82rem", color: t.statusError, marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                                        <XCircle style={{ width: 14, height: 14 }} /> {twoFAError}
                                                    </p>
                                                )}
                                                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
                                                    <button
                                                        onClick={() => { setSetupOpen(false); setQrCodeUrl(""); setManualSecret(""); setTotpToken(""); setTwoFAError(""); }}
                                                        style={{ padding: "10px 20px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={handle2FAVerify}
                                                        disabled={twoFALoading || totpToken.length !== 6}
                                                        style={{ padding: "10px 28px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", opacity: totpToken.length !== 6 ? 0.5 : 1, cursor: totpToken.length !== 6 || twoFALoading ? "not-allowed" : "pointer" }}
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
                                <div style={{ marginTop: "20px", padding: "24px", borderRadius: t.cardRadius, background: t.statusErrorBg, border: `1px solid ${t.statusError}40` }}>
                                    <p style={{ fontSize: "0.9rem", fontWeight: 700, color: t.statusError, marginBottom: "6px", display: "flex", alignItems: "center", gap: 8 }}>
                                        <AlertTriangle style={{ width: 16, height: 16 }} />
                                        Disable Two-Factor Authentication
                                    </p>
                                    <p style={{ fontSize: "0.82rem", color: t.textMuted, marginBottom: "20px" }}>
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
                                        {disableError && (
                                            <p style={{ fontSize: "0.82rem", color: t.statusError, marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                                <XCircle style={{ width: 14, height: 14 }} /> {disableError}
                                            </p>
                                        )}
                                        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
                                            <button
                                                onClick={() => { setIsDisableModalOpen(false); setDisableToken(""); setDisableError(""); }}
                                                style={{ padding: "10px 20px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handle2FADisable}
                                                disabled={disableLoading || disableToken.length !== 6}
                                                style={{
                                                    padding: "10px 24px", borderRadius: t.buttonRadius, border: "none",
                                                    background: disableToken.length === 6 && !disableLoading ? t.statusError : `${t.statusError}4d`,
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


                        {/* Active Sessions */}
                        <div style={{ ...card, padding: "28px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                <div>
                                    <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "4px", color: t.textPrimary }}>Active Sessions</h3>
                                    <p style={{ fontSize: "0.82rem", color: t.textMuted }}>
                                        Devices that have recently signed in to your account.
                                    </p>
                                </div>
                                <button
                                    onClick={loadSessions}
                                    disabled={sessionsLoading}
                                    style={{
                                        display: "inline-flex", alignItems: "center", gap: 6,
                                        fontSize: "0.78rem", padding: "6px 14px", borderRadius: t.buttonRadius,
                                        border: `1px solid ${t.borderPrimary}`, background: "transparent",
                                        color: t.textSecondary, fontWeight: 600, cursor: sessionsLoading ? "not-allowed" : "pointer",
                                        opacity: sessionsLoading ? 0.5 : 1,
                                    }}
                                >
                                    <RefreshCw style={{ width: 12, height: 12 }} />
                                    {sessionsLoading ? "Loading…" : "Refresh"}
                                </button>
                            </div>

                            {sessionsLoading && (
                                <p style={{ fontSize: "0.85rem", color: t.textMuted, textAlign: "center", padding: "20px 0" }}>
                                    Loading sessions…
                                </p>
                            )}

                            {!sessionsLoading && deviceSessions.length === 0 && (
                                <p style={{ fontSize: "0.85rem", color: t.textMuted, textAlign: "center", padding: "20px 0" }}>
                                    No active sessions found. Sign in to see them here.
                                </p>
                            )}

                            {!sessionsLoading && deviceSessions.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                    {deviceSessions.map((ds, idx) => (
                                        <div key={ds.id} style={{ padding: "14px 16px", borderRadius: t.cardRadius, background: t.bgInput, border: `1px solid ${t.borderSecondary}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                                    <p style={{ fontSize: "0.88rem", fontWeight: 600, color: t.textPrimary }}>
                                                        {formatUserAgent(ds.userAgent ?? "")}
                                                    </p>
                                                    {idx === 0 && (
                                                        <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: t.accentPrimaryMuted, color: t.accentPrimary, border: `1px solid ${t.accentPrimary}33`, flexShrink: 0 }}>
                                                            LATEST
                                                        </span>
                                                    )}
                                                </div>
                                                <p style={{ fontSize: "0.75rem", color: t.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {ds.ipAddress ?? "Unknown IP"} · {new Date(ds.lastActive).toLocaleString()}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleRevokeSession(ds.id)}
                                                disabled={revokingId === ds.id}
                                                style={{
                                                    flexShrink: 0, padding: "6px 14px", borderRadius: t.buttonRadius, border: `1px solid ${t.statusError}4d`,
                                                    background: t.statusErrorBg, color: t.statusError, fontSize: "0.78rem", fontWeight: 600,
                                                    cursor: revokingId === ds.id ? "not-allowed" : "pointer",
                                                    opacity: revokingId === ds.id ? 0.5 : 1, transition: "all 0.15s",
                                                }}
                                            >
                                                {revokingId === ds.id ? "Revoking…" : "Revoke"}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                )}
        </div>
    );
}
