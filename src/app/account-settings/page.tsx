"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import {
    User, ShieldCheck, AlertTriangle, CheckCircle, XCircle, Info
} from "lucide-react";

export default function AccountSettingsPage() {
    const { data: session } = useSession();
    const t = useThemeTokens();

    // Profile
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [saving, setSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // 2FA
    const [is2FAEnabled, setIs2FAEnabled] = useState(false);
    const [setupOpen, setSetupOpen] = useState(false);
    const [twoFALoading, setTwoFALoading] = useState(false);
    const [twoFAError, setTwoFAError] = useState("");
    const [qrCodeUrl, setQrCodeUrl] = useState("");
    const [manualSecret, setManualSecret] = useState("");
    const [totpToken, setTotpToken] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    // Disable
    const [isDisableOpen, setIsDisableOpen] = useState(false);
    const [disableToken, setDisableToken] = useState("");
    const [disableLoading, setDisableLoading] = useState(false);
    const [disableError, setDisableError] = useState("");

    useEffect(() => {
        if (session?.user) {
            setName((session.user.name as string) || "");
            setEmail((session.user.email as string) || "");
        }
    }, [session]);

    // Check 2FA status from DB
    useEffect(() => {
        fetch("/api/overview")
            .then(r => r.json())
            .then((d: { user?: { twoFactorEnabled?: boolean } }) => {
                if (d?.user?.twoFactorEnabled) setIs2FAEnabled(true);
            })
            .catch(() => {});
    }, []);

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
                ? { type: "success", text: "Profile updated." }
                : { type: "error", text: data.error }
            );
        } catch {
            setProfileMsg({ type: "error", text: "Network error." });
        } finally {
            setSaving(false);
        }
    };

    const handle2FAToggle = async () => {
        if (is2FAEnabled) { setIsDisableOpen(true); return; }
        setSetupOpen(true);
        setTwoFALoading(true);
        setTwoFAError("");
        setTotpToken("");
        try {
            const res = await fetch("/api/auth/2fa/generate");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed");
            setQrCodeUrl(data.qrCodeUrl);
            setManualSecret(data.secret);
        } catch (err) {
            setTwoFAError(err instanceof Error ? err.message : "Failed");
            setSetupOpen(false);
        } finally {
            setTwoFALoading(false);
        }
    };

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
            setSuccessMsg("Two-factor authentication enabled.");
            setTimeout(() => setSuccessMsg(""), 4000);
        } catch (err) {
            setTwoFAError(err instanceof Error ? err.message : "Failed");
        } finally {
            setTwoFALoading(false);
        }
    };

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
            if (!res.ok) throw new Error(data.error ?? "Failed");
            setIs2FAEnabled(false);
            setIsDisableOpen(false);
            setDisableToken("");
            setSuccessMsg("2FA disabled.");
            setTimeout(() => setSuccessMsg(""), 4000);
        } catch (err) {
            setDisableError(err instanceof Error ? err.message : "Failed");
        } finally {
            setDisableLoading(false);
        }
    };

    const card: React.CSSProperties = {
        background: t.bgCard,
        border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.cardRadius,
        boxShadow: t.shadow,
    };

    const inputStyle: React.CSSProperties = {
        width: "100%", padding: "10px 14px",
        background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
        borderRadius: t.isMono ? 4 : 8,
        color: t.textPrimary, fontSize: "0.9rem",
        outline: "none", fontFamily: "inherit", boxSizing: "border-box",
    };

    const labelStyle: React.CSSProperties = {
        display: "block", marginBottom: "6px",
        fontSize: "0.82rem", color: t.textMuted,
        fontWeight: 600, textTransform: "uppercase",
        letterSpacing: "0.05em",
    };

    const initial = (session?.user?.name || session?.user?.email || "U")[0].toUpperCase();

    return (
        <div style={{ maxWidth: 680 }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary, marginBottom: 8 }}>
                Account Settings
            </h1>
            <p style={{ fontSize: "0.88rem", color: t.textMuted, marginBottom: 32 }}>
                Manage your profile and security preferences.
            </p>

            {/* Success toast */}
            {successMsg && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "12px 16px", marginBottom: 20,
                    borderRadius: t.isMono ? 4 : 8,
                    background: t.statusSuccessBg,
                    border: `1px solid ${t.statusSuccess}4d`,
                    color: t.statusSuccess, fontSize: "0.86rem", fontWeight: 600,
                }}>
                    <CheckCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                    {successMsg}
                </div>
            )}

            {/* ── Profile Card ── */}
            <div style={{ ...card, padding: 28, marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                    <User style={{ width: 18, height: 18, color: t.accentPrimary }} />
                    <h2 style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary }}>Profile</h2>
                </div>

                {/* Avatar */}
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: t.isMono ? 10 : 16,
                        background: t.isMono ? t.bgTertiary : "linear-gradient(135deg, #3b82f6, #6366f1)",
                        border: t.isMono ? `1px solid ${t.borderPrimary}` : "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "1.6rem", fontWeight: 800,
                        color: t.isLight ? t.textPrimary : "#fff",
                    }}>
                        {initial}
                    </div>
                    <div>
                        <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "1rem" }}>
                            {session?.user?.name || "User"}
                        </p>
                        <p style={{ fontSize: "0.78rem", color: t.textMuted }}>
                            {session?.user?.email}
                        </p>
                    </div>
                </div>

                <form onSubmit={handleProfileSave}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div>
                            <label style={labelStyle}>Display Name</label>
                            <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Email Address</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
                        </div>
                        {profileMsg && (
                            <p style={{ fontSize: "0.85rem", color: profileMsg.type === "success" ? t.statusSuccess : t.statusError, display: "flex", alignItems: "center", gap: 6 }}>
                                {profileMsg.type === "success"
                                    ? <CheckCircle style={{ width: 14, height: 14 }} />
                                    : <XCircle style={{ width: 14, height: 14 }} />}
                                {profileMsg.text}
                            </p>
                        )}
                        <button type="submit" disabled={saving} style={{
                            alignSelf: "flex-start", padding: "10px 28px",
                            borderRadius: t.buttonRadius, border: "none",
                            background: t.accentPrimary, color: t.textInverse,
                            fontWeight: 700, fontSize: "0.875rem",
                            cursor: saving ? "not-allowed" : "pointer",
                        }}>
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>

            {/* ── Login 2FA Toggle ── */}
            <div style={{ ...card, padding: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <ShieldCheck style={{ width: 18, height: 18, color: t.accentPrimary }} />
                    <h2 style={{ fontSize: "1rem", fontWeight: 700, color: t.textPrimary }}>
                        Two-Factor Authentication
                    </h2>
                </div>

                {/* Recommendation banner when OFF */}
                {!is2FAEnabled && !setupOpen && (
                    <div style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "14px 16px", marginBottom: 20,
                        borderRadius: t.isMono ? 4 : 8,
                        background: t.statusWarningBg,
                        border: `1px solid ${t.statusWarning}33`,
                    }}>
                        <Info style={{ width: 18, height: 18, color: t.statusWarning, flexShrink: 0, marginTop: 1 }} />
                        <div>
                            <p style={{ fontSize: "0.88rem", fontWeight: 700, color: t.statusWarning, marginBottom: 4 }}>
                                Strongly recommended
                            </p>
                            <p style={{ fontSize: "0.82rem", color: t.textMuted, lineHeight: 1.5 }}>
                                Enable two-factor authentication to protect your account, payments,
                                and critical actions like VM provisioning and marketplace purchases.
                            </p>
                        </div>
                    </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                        <p style={{ fontSize: "0.88rem", color: t.textPrimary, fontWeight: 600 }}>
                            {is2FAEnabled ? "2FA is active" : "2FA is not enabled"}
                        </p>
                        <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 2 }}>
                            {is2FAEnabled
                                ? "Your account is protected. 2FA is required for critical actions."
                                : "Use Google Authenticator or a compatible TOTP app."}
                        </p>
                    </div>
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
                {is2FAEnabled && !isDisableOpen && !setupOpen && (
                    <div style={{
                        padding: "14px 18px", borderRadius: t.isMono ? 4 : 8,
                        background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`,
                        display: "flex", alignItems: "center", gap: 10,
                    }}>
                        <ShieldCheck style={{ width: 22, height: 22, color: t.statusSuccess, flexShrink: 0 }} />
                        <div>
                            <p style={{ fontSize: "0.88rem", fontWeight: 700, color: t.statusSuccess }}>2FA is active</p>
                            <p style={{ fontSize: "0.78rem", color: t.textMuted, marginTop: 2 }}>Click the toggle to disable.</p>
                        </div>
                    </div>
                )}

                {/* Setup flow */}
                {setupOpen && !is2FAEnabled && (
                    <div style={{ marginTop: 16, padding: 24, borderRadius: t.isMono ? 4 : 8, background: t.accentPrimaryMuted, border: `1px solid ${t.accentPrimary}1f` }}>
                        {twoFALoading && !qrCodeUrl && (
                            <p style={{ textAlign: "center", color: t.textMuted, padding: "20px 0" }}>Generating QR code...</p>
                        )}
                        {qrCodeUrl && (
                            <>
                                <div style={{ textAlign: "center", marginBottom: 20 }}>
                                    <p style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                                        Step 1 — Scan with your authenticator app
                                    </p>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={qrCodeUrl} alt="2FA QR Code" width={192} height={192}
                                        style={{ margin: "0 auto", borderRadius: 12, background: "#111", display: "block" }} />
                                </div>
                                {manualSecret && (
                                    <div style={{ textAlign: "center", marginBottom: 24 }}>
                                        <p style={{ fontSize: "0.75rem", color: t.textMuted, marginBottom: 6 }}>Or enter manually:</p>
                                        <code style={{
                                            display: "inline-block", padding: "8px 16px", borderRadius: 8,
                                            background: t.bgInput, border: `1px solid ${t.borderPrimary}`,
                                            color: t.accentPrimary, fontSize: "0.85rem", fontWeight: 700,
                                            letterSpacing: "0.1em", userSelect: "all", fontFamily: t.fontMono,
                                        }}>
                                            {manualSecret}
                                        </code>
                                    </div>
                                )}
                                <div style={{ textAlign: "center" }}>
                                    <p style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                                        Step 2 — Enter the 6-digit code
                                    </p>
                                    <input
                                        value={totpToken}
                                        onChange={e => { setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6)); setTwoFAError(""); }}
                                        style={{ ...inputStyle, textAlign: "center", maxWidth: 200, margin: "0 auto", fontSize: "1.2rem", letterSpacing: "0.3em", fontWeight: 700 }}
                                        placeholder="000000" maxLength={6} inputMode="numeric" autoComplete="one-time-code"
                                    />
                                    {twoFAError && (
                                        <p style={{ fontSize: "0.82rem", color: t.statusError, marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                            <XCircle style={{ width: 14, height: 14 }} /> {twoFAError}
                                        </p>
                                    )}
                                    <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
                                        <button onClick={() => { setSetupOpen(false); setQrCodeUrl(""); setManualSecret(""); setTotpToken(""); setTwoFAError(""); }}
                                            style={{ padding: "10px 20px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}>
                                            Cancel
                                        </button>
                                        <button onClick={handle2FAVerify}
                                            disabled={twoFALoading || totpToken.length !== 6}
                                            style={{ padding: "10px 28px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", opacity: totpToken.length !== 6 ? 0.5 : 1, cursor: totpToken.length !== 6 || twoFALoading ? "not-allowed" : "pointer" }}>
                                            {twoFALoading ? "Verifying..." : "Verify & Enable"}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Disable flow */}
                {isDisableOpen && (
                    <div style={{ marginTop: 16, padding: 24, borderRadius: t.isMono ? 4 : 8, background: t.statusErrorBg, border: `1px solid ${t.statusError}40` }}>
                        <p style={{ fontSize: "0.9rem", fontWeight: 700, color: t.statusError, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                            <AlertTriangle style={{ width: 16, height: 16 }} />
                            Disable Two-Factor Authentication
                        </p>
                        <p style={{ fontSize: "0.82rem", color: t.textMuted, marginBottom: 20 }}>
                            Enter your 6-digit authenticator code to disable 2FA.
                        </p>
                        <div style={{ textAlign: "center" }}>
                            <input
                                value={disableToken}
                                onChange={e => { setDisableToken(e.target.value.replace(/\D/g, "").slice(0, 6)); setDisableError(""); }}
                                style={{ ...inputStyle, textAlign: "center", maxWidth: 200, margin: "0 auto", fontSize: "1.2rem", letterSpacing: "0.3em", fontWeight: 700 }}
                                placeholder="000000" maxLength={6} inputMode="numeric" autoComplete="one-time-code" autoFocus
                            />
                            {disableError && (
                                <p style={{ fontSize: "0.82rem", color: t.statusError, marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                    <XCircle style={{ width: 14, height: 14 }} /> {disableError}
                                </p>
                            )}
                            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
                                <button onClick={() => { setIsDisableOpen(false); setDisableToken(""); setDisableError(""); }}
                                    style={{ padding: "10px 20px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}>
                                    Cancel
                                </button>
                                <button onClick={handle2FADisable}
                                    disabled={disableLoading || disableToken.length !== 6}
                                    style={{
                                        padding: "10px 24px", borderRadius: t.buttonRadius, border: "none",
                                        background: disableToken.length === 6 && !disableLoading ? t.statusError : `${t.statusError}4d`,
                                        color: "#fff", fontWeight: 700, fontSize: "0.9rem",
                                        cursor: disableToken.length !== 6 || disableLoading ? "not-allowed" : "pointer",
                                    }}>
                                    {disableLoading ? "Disabling..." : "Confirm Disable"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
