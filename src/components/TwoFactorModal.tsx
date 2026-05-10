"use client";

import { useState, useEffect, useRef } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { ShieldCheck, X, AlertTriangle } from "lucide-react";

interface TwoFactorModalProps {
    /** Whether the modal is visible */
    open: boolean;
    /** Called when the user cancels or closes the modal */
    onClose: () => void;
    /** Called with the 6-digit TOTP token when user submits */
    onSubmit: (token: string) => void;
    /** Optional loading state while the parent re-sends the API request */
    loading?: boolean;
    /** Optional error message to display (e.g., "Invalid code") */
    error?: string;
}

/**
 * TwoFactorModal
 *
 * Reusable modal that pops up when an API returns `{ error: "2FA_REQUIRED" }`.
 * The user enters their 6-digit TOTP code, and the parent component
 * retries the original API call with the token appended.
 */
export default function TwoFactorModal({
    open,
    onClose,
    onSubmit,
    loading = false,
    error,
}: TwoFactorModalProps) {
    const t = useThemeTokens();
    const [token, setToken] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Reset token when modal opens
    useEffect(() => {
        if (open) {
            setToken("");
            // Focus the input after a brief delay for animation
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open]);

    if (!open) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (token.length === 6 && !loading) {
            onSubmit(token);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: "fixed", inset: 0, zIndex: 9998,
                    background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(4px)",
                    animation: "fadeIn 0.15s ease-out",
                }}
            />

            {/* Modal */}
            <div style={{
                position: "fixed", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)", zIndex: 9999,
                width: "100%", maxWidth: 420,
                background: t.bgCard, border: `1px solid ${t.borderPrimary}`,
                borderRadius: t.cardRadius, boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
                animation: "scaleIn 0.2s ease-out",
            }}>
                {/* Header */}
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "20px 24px 16px",
                    borderBottom: `1px solid ${t.borderSecondary}`,
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <ShieldCheck style={{ width: 20, height: 20, color: t.accentPrimary }} />
                        <h3 style={{
                            fontSize: "1rem", fontWeight: 700, color: t.textPrimary,
                        }}>
                            Two-Factor Verification
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            padding: 4, border: "none", background: "transparent",
                            cursor: "pointer", color: t.textMuted, borderRadius: 6,
                            transition: "color 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = t.textPrimary; }}
                        onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; }}
                    >
                        <X style={{ width: 18, height: 18 }} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
                    <p style={{
                        fontSize: "0.88rem", color: t.textSecondary, marginBottom: 20,
                        lineHeight: 1.6,
                    }}>
                        This action requires two-factor authentication. Enter the 6-digit
                        code from your authenticator app to continue.
                    </p>

                    {/* Error */}
                    {error && (
                        <div style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "10px 14px", marginBottom: 16,
                            borderRadius: t.isMono ? 4 : 8,
                            background: t.statusErrorBg,
                            border: `1px solid ${t.statusError}33`,
                            color: t.statusError,
                            fontSize: "0.82rem", fontWeight: 600,
                        }}>
                            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
                            {error}
                        </div>
                    )}

                    {/* TOTP Input */}
                    <input
                        ref={inputRef}
                        id="2fa-modal-input"
                        value={token}
                        onChange={e => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        style={{
                            width: "100%", padding: "14px 16px",
                            textAlign: "center", fontSize: "1.4rem",
                            letterSpacing: "0.35em", fontWeight: 800,
                            background: t.bgInput,
                            border: `1px solid ${t.borderPrimary}`,
                            borderRadius: t.isMono ? 4 : 8,
                            color: t.textPrimary, outline: "none",
                            fontFamily: t.fontMono,
                            boxSizing: "border-box",
                            transition: "border-color 0.15s",
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = t.accentPrimary; }}
                        onBlur={e => { e.currentTarget.style.borderColor = t.borderPrimary; }}
                    />

                    {/* Actions */}
                    <div style={{
                        display: "flex", gap: 10, justifyContent: "flex-end",
                        marginTop: 20,
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: "10px 20px", borderRadius: t.buttonRadius,
                                border: `1px solid ${t.borderPrimary}`,
                                background: "transparent", color: t.textSecondary,
                                fontWeight: 600, fontSize: "0.875rem",
                                cursor: "pointer",
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={token.length !== 6 || loading}
                            style={{
                                padding: "10px 24px", borderRadius: t.buttonRadius,
                                border: "none",
                                background: token.length === 6 && !loading
                                    ? t.accentPrimary
                                    : `${t.accentPrimary}4d`,
                                color: t.textInverse,
                                fontWeight: 700, fontSize: "0.875rem",
                                cursor: token.length !== 6 || loading ? "not-allowed" : "pointer",
                                transition: "background 0.15s",
                            }}
                        >
                            {loading ? "Verifying..." : "Verify & Continue"}
                        </button>
                    </div>
                </form>
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleIn { from { opacity: 0; transform: translate(-50%,-50%) scale(0.95); } to { opacity: 1; transform: translate(-50%,-50%) scale(1); } }
            `}</style>
        </>
    );
}
