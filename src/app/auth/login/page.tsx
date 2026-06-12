"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

type Method = "otp" | "email" | "recovery";

const METHOD_META: Record<Method, { label: string; subtitle: string; pick: string }> = {
    otp: {
        label: "Authenticator code",
        subtitle: "Enter the 6-digit code from your authenticator app",
        pick: "Use my authenticator app",
    },
    email: {
        label: "Email code",
        subtitle: "Enter the 6-digit code we emailed you",
        pick: "Email me a code",
    },
    recovery: {
        label: "Backup code",
        subtitle: "Enter one of your saved backup codes",
        pick: "Use a backup code",
    },
};

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    // "credentials" → email+password. "challenge" → 2FA code step.
    const [step, setStep] = useState<"credentials" | "challenge">("credentials");
    const [methods, setMethods] = useState<Method[]>([]);
    const [activeMethod, setActiveMethod] = useState<Method>("otp");
    const [showPicker, setShowPicker] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    // Backup codes locked (10 lifetime attempts exhausted) — steer to support.
    const [recoveryLocked, setRecoveryLocked] = useState(false);
    // "Lost access to everything" support-ticket escape hatch.
    const [showHelp, setShowHelp] = useState(false);
    const [helpBusy, setHelpBusy] = useState(false);
    const [helpSent, setHelpSent] = useState(false);
    const [helpNote, setHelpNote] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    // Honour callbackUrl from middleware, default to Console overview
    const callbackUrl = searchParams?.get("callbackUrl") || "/dashboard";

    const isRecovery = activeMethod === "recovery";

    // Completes the NextAuth sign-in. `authorize()` re-validates everything
    // server-side (the code), so this is the real gate — not the UI.
    const completeSignIn = async (verifyCode?: string, method?: Method) => {
        const result = await signIn("credentials", {
            email,
            password,
            // OTP travels as `totp`, email codes as `emailCode`, backup codes as
            // `recoveryCode`. The unused ones are sent empty and ignored by authorize().
            totp: method === "otp" ? (verifyCode ?? "") : "",
            emailCode: method === "email" ? (verifyCode ?? "") : "",
            recoveryCode: method === "recovery" ? (verifyCode ?? "") : "",
            redirect: false,
        });

        if (result?.error) {
            setError(
                verifyCode !== undefined
                    ? (method === "recovery"
                        ? "Invalid or already-used backup code."
                        : "Invalid code. Please try again.")
                    : "Invalid email or password.",
            );
            return;
        }

        fetch("/api/auth/log-login", { method: "POST" }).catch(() => {});
        router.push(callbackUrl);
    };

    // Request an email code for the login challenge (no session yet — the
    // endpoint re-verifies the password before sending).
    const sendEmailCode = async () => {
        try {
            await fetch("/api/auth/2fa/email/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            setEmailSent(true);
        } catch { /* non-fatal — user can resend */ }
    };

    // Switch to another enabled method; sending a fresh email code if needed.
    const selectMethod = (m: Method) => {
        setActiveMethod(m);
        setCode("");
        setError("");
        setShowPicker(false);
        if (m === "email") { setEmailSent(false); sendEmailCode(); }
    };

    // Logged-out recovery: re-verify password server-side, file a support ticket.
    const sendRecoveryTicket = async () => {
        setHelpBusy(true);
        setError("");
        try {
            const res = await fetch("/api/auth/recovery-ticket", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, message: helpNote }),
            });
            if (res.status === 401) {
                setError("We couldn't verify your email and password.");
                return;
            }
            // Generic success regardless (no account enumeration).
            setHelpSent(true);
        } catch {
            setError("An unexpected error occurred.");
        } finally {
            setHelpBusy(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            if (step === "credentials") {
                // Step 1 — verify password + learn the available 2FA methods,
                // without creating a session yet.
                const res = await fetch("/api/auth/precheck", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });

                if (res.status === 429) {
                    setError("Too many attempts. Please try again shortly.");
                    return;
                }
                if (!res.ok) {
                    setError("Invalid email or password.");
                    return;
                }

                const data = await res.json();
                if (data.requires2fa) {
                    const ms: Method[] = Array.isArray(data.methods) && data.methods.length
                        ? data.methods
                        : ["otp"];
                    setMethods(ms);
                    setActiveMethod(ms[0]);
                    setRecoveryLocked(!!data.recoveryLocked);
                    setStep("challenge");
                    // If email is the primary method, dispatch a code immediately.
                    if (ms[0] === "email") { setEmailSent(false); sendEmailCode(); }
                    return;
                }

                await completeSignIn();
            } else {
                // Step 2 — submit the 2FA code for the active method.
                if (isRecovery) {
                    if (code.replace(/[^a-zA-Z0-9]/g, "").length < 8) {
                        setError("Enter a full backup code.");
                        return;
                    }
                } else if (!/^\d{6}$/.test(code.trim())) {
                    setError("Enter the 6-digit code.");
                    return;
                }
                await completeSignIn(code.trim(), activeMethod);
            }
        } catch {
            setError("An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    const resetToCredentials = () => {
        setStep("credentials");
        setCode("");
        setError("");
        setShowPicker(false);
        setShowHelp(false);
        setHelpSent(false);
        setRecoveryLocked(false);
    };

    return (
        <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "100px 24px" }}>
            <div
                className="glass-card animate-fade-in-up"
                style={{
                    width: "100%",
                    maxWidth: "440px",
                    padding: "48px 40px",
                }}
            >
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: "36px" }}>
                    <div
                        style={{
                            width: 48, height: 48, borderRadius: "12px",
                            background: "var(--gradient-primary)",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: "1.2rem", color: "var(--text-inverse)",
                            marginBottom: "16px",
                        }}
                    >
                        NR
                    </div>
                    <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "8px" }}>
                        {step === "challenge" ? "Two-factor verification" : "Welcome Back"}
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                        {step === "challenge"
                            ? METHOD_META[activeMethod].subtitle
                            : "Sign in to your account"}
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div
                        style={{
                            padding: "12px 16px",
                            borderRadius: "8px",
                            background: "rgba(255,0,110,0.1)",
                            border: "1px solid rgba(255,0,110,0.2)",
                            color: "var(--accent-magenta)",
                            fontSize: "0.85rem",
                            marginBottom: "20px",
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {step === "credentials" ? (
                        <>
                            <div>
                                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    className="input-field"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                                    Password
                                </label>
                                <input
                                    type="password"
                                    className="input-field"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={8}
                                    autoComplete="current-password"
                                />
                            </div>
                        </>
                    ) : (
                        <div>
                            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                                {METHOD_META[activeMethod].label}
                            </label>
                            {isRecovery ? (
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="XXXXX-XXXXX"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 11))}
                                    required
                                    autoFocus
                                    autoComplete="one-time-code"
                                    style={{ letterSpacing: "0.2em", textAlign: "center", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}
                                />
                            ) : (
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="\d{6}"
                                    maxLength={6}
                                    className="input-field"
                                    placeholder="123456"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    required
                                    autoFocus
                                    autoComplete="one-time-code"
                                    style={{ letterSpacing: "0.4em", textAlign: "center", fontFamily: "'JetBrains Mono', monospace" }}
                                />
                            )}

                            {activeMethod === "email" && (
                                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "8px" }}>
                                    {emailSent ? "We emailed a code to your address. " : "Sending a code to your email… "}
                                    <button
                                        type="button"
                                        onClick={() => { setEmailSent(false); sendEmailCode(); }}
                                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--accent-cyan)", fontSize: "0.78rem", fontWeight: 600, padding: 0 }}
                                    >
                                        Resend
                                    </button>
                                </p>
                            )}

                            {isRecovery && (
                                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "8px" }}>
                                    Each backup code works once. You have a limited number of total backup-code attempts.
                                </p>
                            )}

                            {/* Choose another method — only the ones this account has */}
                            {methods.length > 1 && (
                                <div style={{ marginTop: "12px" }}>
                                    {!showPicker ? (
                                        <button
                                            type="button"
                                            onClick={() => setShowPicker(true)}
                                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--accent-cyan)", fontSize: "0.82rem", fontWeight: 600, padding: 0 }}
                                        >
                                            Use another verification method
                                        </button>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                            {methods.filter((m) => m !== activeMethod).map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => selectMethod(m)}
                                                    style={{
                                                        textAlign: "left", padding: "10px 14px", cursor: "pointer",
                                                        borderRadius: "8px", border: "1px solid var(--glass-border)",
                                                        background: "var(--glass-bg)", color: "var(--text-primary)",
                                                        fontSize: "0.85rem", fontWeight: 600,
                                                    }}
                                                >
                                                    {METHOD_META[m].pick}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ width: "100%", marginTop: "8px", opacity: loading ? 0.7 : 1 }}
                    >
                        {loading
                            ? (step === "challenge" ? "Verifying..." : "Signing in...")
                            : (step === "challenge" ? "Verify & Sign In" : "Sign In")}
                    </button>

                    {step === "challenge" && (
                        <>
                            {/* Lost-access escape hatch → files a support ticket */}
                            <div style={{ marginTop: "4px", textAlign: "center" }}>
                                {recoveryLocked && (
                                    <p style={{ fontSize: "0.78rem", color: "var(--accent-magenta)", marginBottom: "6px" }}>
                                        Backup codes are locked on this account. Use another method, or contact support.
                                    </p>
                                )}
                                {!showHelp && !helpSent && (
                                    <button
                                        type="button"
                                        onClick={() => { setShowHelp(true); setError(""); }}
                                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.8rem", textDecoration: "underline" }}
                                    >
                                        Can&apos;t access any of your methods?
                                    </button>
                                )}
                            </div>

                            {showHelp && !helpSent && (
                                <div style={{ padding: "14px 16px", borderRadius: "8px", border: "1px solid var(--glass-border)", background: "var(--glass-bg)", display: "flex", flexDirection: "column", gap: "10px" }}>
                                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                                        We&apos;ll open a support ticket on your account so our team can verify your identity and restore access. Add anything that helps us reach you (optional).
                                    </p>
                                    <textarea
                                        value={helpNote}
                                        onChange={(e) => setHelpNote(e.target.value.slice(0, 2000))}
                                        placeholder="Optional: details or an alternate contact"
                                        rows={3}
                                        className="input-field"
                                        style={{ resize: "vertical", fontFamily: "inherit" }}
                                    />
                                    <div style={{ display: "flex", gap: "8px" }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowHelp(false)}
                                            disabled={helpBusy}
                                            style={{ flex: "0 0 auto", padding: "9px 16px", borderRadius: "8px", border: "1px solid var(--glass-border)", background: "transparent", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={sendRecoveryTicket}
                                            disabled={helpBusy}
                                            className="btn btn-primary"
                                            style={{ flex: 1, opacity: helpBusy ? 0.7 : 1 }}
                                        >
                                            {helpBusy ? "Sending…" : "Send recovery request"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {helpSent && (
                                <div style={{ padding: "12px 16px", borderRadius: "8px", background: "rgba(0,200,120,0.1)", border: "1px solid rgba(0,200,120,0.25)", color: "var(--accent-cyan)", fontSize: "0.82rem", lineHeight: 1.5 }}>
                                    If your email and password were correct, we&apos;ve filed a recovery ticket. Our team will reach out to verify your identity.
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={resetToCredentials}
                                disabled={loading}
                                style={{
                                    background: "transparent", border: "none", cursor: "pointer",
                                    color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "4px",
                                }}
                            >
                                ← Back to login
                            </button>
                        </>
                    )}
                </form>

                <div style={{ textAlign: "center", marginTop: "24px" }}>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        Don&apos;t have an account?{" "}
                        <Link href="/auth/register" style={{ color: "var(--accent-cyan)", textDecoration: "none", fontWeight: 600 }}>
                            Create one
                        </Link>
                    </p>
                </div>
            </div>
        </section>
    );
}
