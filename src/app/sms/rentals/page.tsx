"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useCredits } from "@/components/CreditProvider";
import {
    Inbox, Copy, Check, Clock, CheckCircle2, AlertTriangle, Loader2, RefreshCw, Phone, X,
} from "lucide-react";

interface Rental {
    id: string; phoneNumber: string | null; country: string; status: string;
    priceCredits: number; code: string | null; createdAt: string; expiresAt: string;
    service: { name: string; code: string } | null; needsCredits?: boolean;
}

const ACTIVE = "WAITING";

export default function SmsRentalsPage() {
    const t = useThemeTokens();
    const { refresh: refreshCredits } = useCredits();

    const [rentals, setRentals] = useState<Rental[]>([]);
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(Date.now());
    const [copied, setCopied] = useState<string | null>(null);
    const [cancelling, setCancelling] = useState<string | null>(null);

    const rentalsRef = useRef<Rental[]>([]);
    useEffect(() => { rentalsRef.current = rentals; }, [rentals]);

    const loadList = useCallback(async () => {
        try {
            const res = await fetch("/api/sms/rentals");
            if (res.ok) { const d = await res.json(); setRentals(d.rentals ?? []); }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    // Poll each WAITING rental's detail endpoint — that's what advances the
    // provider fetch + charge-on-receipt server-side.
    const pollActive = useCallback(async () => {
        const active = rentalsRef.current.filter(r => r.status === ACTIVE);
        if (active.length === 0) return;
        const updates = await Promise.all(active.map(async r => {
            try { const res = await fetch(`/api/sms/rentals/${r.id}`); if (res.ok) return (await res.json()).rental as Rental; }
            catch { /* ignore */ }
            return null;
        }));
        const byId = new Map(updates.filter((u): u is Rental => !!u).map(u => [u.id, u]));
        if (byId.size === 0) return;
        let received = false;
        setRentals(prev => prev.map(r => {
            const u = byId.get(r.id);
            if (u && u.status === "RECEIVED" && r.status !== "RECEIVED") received = true;
            return u ?? r;
        }));
        if (received) refreshCredits();
    }, [refreshCredits]);

    useEffect(() => { loadList(); }, [loadList]);
    useEffect(() => {
        const poll = setInterval(pollActive, 5000);
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => { clearInterval(poll); clearInterval(tick); };
    }, [pollActive]);

    const copy = (key: string, value: string) => {
        navigator.clipboard?.writeText(value).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
    };

    const cancel = async (id: string) => {
        setCancelling(id);
        try {
            const res = await fetch(`/api/sms/rentals/${id}`, { method: "DELETE" });
            if (res.ok) setRentals(prev => prev.map(r => r.id === id ? { ...r, status: "CANCELLED" } : r));
        } catch { /* ignore */ }
        finally { setCancelling(null); }
    };

    const fmtCountdown = (expiresAt: string) => {
        const ms = new Date(expiresAt).getTime() - now;
        if (ms <= 0) return "expiring…";
        const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
        return `${m}:${String(s).padStart(2, "0")}`;
    };

    const statusMeta = (s: string): { label: string; color: string; bg: string } => {
        switch (s) {
            case "WAITING": return { label: "Waiting for SMS", color: t.statusWarning, bg: t.statusWarningBg };
            case "RECEIVED": return { label: "Code received", color: t.statusSuccess, bg: t.statusSuccessBg };
            case "CANCELLED": return { label: "Cancelled", color: t.textMuted, bg: t.bgTertiary };
            case "EXPIRED": return { label: "Expired", color: t.textMuted, bg: t.bgTertiary };
            default: return { label: "Error", color: t.statusError, bg: t.statusErrorBg };
        }
    };

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    const active = rentals.filter(r => r.status === ACTIVE || r.status === "RECEIVED");
    const history = rentals.filter(r => r.status !== ACTIVE && r.status !== "RECEIVED");

    return (
        <div style={{ padding: "28px 32px", minHeight: "100vh" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                <div>
                    <p style={{ fontSize: "0.75rem", color: t.textMuted, marginBottom: 6 }}>TimoSMS &bull; My Rentals</p>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
                        <Inbox style={{ width: 22, height: 22, color: t.accentPrimary }} /> My Rentals
                    </h1>
                </div>
                <button id="sms-refresh" onClick={() => { setLoading(true); loadList(); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}>
                    <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                </button>
            </div>

            {loading ? (
                <div style={{ ...card, padding: "56px 40px", textAlign: "center", color: t.textMuted }}>Loading rentals…</div>
            ) : rentals.length === 0 ? (
                <div style={{ ...card, padding: "56px 40px", textAlign: "center" }}>
                    <Inbox style={{ width: 28, height: 28, color: t.accentPrimary, margin: "0 auto 12px" }} />
                    <h3 style={{ fontWeight: 700, marginBottom: 8, fontSize: "1.1rem", color: t.textPrimary }}>No rentals yet</h3>
                    <p style={{ color: t.textMuted, fontSize: "0.875rem", marginBottom: 16 }}>Rent a number from the catalog to receive an SMS code.</p>
                    <Link href="/sms" style={{ display: "inline-block", padding: "10px 22px", borderRadius: t.buttonRadius, textDecoration: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.85rem" }}>Browse catalog</Link>
                </div>
            ) : (
                <>
                    {/* Active + just-received */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: history.length ? 32 : 0 }}>
                        {active.map(r => {
                            const m = statusMeta(r.status);
                            return (
                                <div key={r.id} style={{ ...card, padding: 18 }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <div style={{ width: 40, height: 40, borderRadius: t.buttonRadius, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", color: t.accentPrimary, fontWeight: 800 }}>
                                                {(r.service?.name?.[0] ?? "#").toUpperCase()}
                                            </div>
                                            <div>
                                                <p style={{ fontWeight: 700, color: t.textPrimary }}>{r.service?.name ?? "Service"}</p>
                                                <p style={{ fontSize: "0.72rem", color: t.textMuted, fontFamily: t.fontMono }}>{r.country} · {r.priceCredits.toLocaleString()} cr</p>
                                            </div>
                                        </div>
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: m.bg, color: m.color, fontSize: "0.72rem", fontWeight: 700 }}>
                                            {r.status === "WAITING" ? <Clock style={{ width: 12, height: 12 }} /> : r.status === "RECEIVED" ? <CheckCircle2 style={{ width: 12, height: 12 }} /> : null}
                                            {m.label}{r.status === "WAITING" ? ` · ${fmtCountdown(r.expiresAt)}` : ""}
                                        </span>
                                    </div>

                                    {/* Number */}
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: t.buttonRadius, background: t.bgInput, border: `1px solid ${t.borderSecondary}`, marginBottom: 10 }}>
                                        <Phone style={{ width: 15, height: 15, color: t.textMuted, flexShrink: 0 }} />
                                        <code style={{ flex: 1, color: t.textPrimary, fontFamily: t.fontMono, fontSize: "0.95rem", userSelect: "all" }}>{r.phoneNumber ?? "—"}</code>
                                        {r.phoneNumber && (
                                            <button onClick={() => copy(`num-${r.id}`, r.phoneNumber!)} title="Copy number" style={{ background: "transparent", border: "none", cursor: "pointer", color: copied === `num-${r.id}` ? t.statusSuccess : t.textMuted, display: "inline-flex" }}>
                                                {copied === `num-${r.id}` ? <Check style={{ width: 15, height: 15 }} /> : <Copy style={{ width: 15, height: 15 }} />}
                                            </button>
                                        )}
                                    </div>

                                    {/* Code / waiting / needs-credits */}
                                    {r.status === "RECEIVED" && r.code ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: t.buttonRadius, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33` }}>
                                            <span style={{ fontSize: "0.72rem", color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Code</span>
                                            <code style={{ flex: 1, color: t.statusSuccess, fontFamily: t.fontMono, fontSize: "1.4rem", fontWeight: 800, letterSpacing: "0.15em", userSelect: "all" }}>{r.code}</code>
                                            <button onClick={() => copy(`code-${r.id}`, r.code!)} title="Copy code" style={{ background: "transparent", border: "none", cursor: "pointer", color: copied === `code-${r.id}` ? t.statusSuccess : t.textMuted, display: "inline-flex" }}>
                                                {copied === `code-${r.id}` ? <Check style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />}
                                            </button>
                                        </div>
                                    ) : r.needsCredits ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: t.buttonRadius, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, fontSize: "0.82rem" }}>
                                            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
                                            A code arrived but your balance is too low to unlock it.
                                            <Link href="/dashboard/billing/topup" style={{ marginLeft: "auto", color: t.accentPrimary, fontWeight: 700, textDecoration: "none" }}>Top up →</Link>
                                        </div>
                                    ) : r.status === "WAITING" ? (
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.82rem", color: t.textMuted }}>
                                                <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Waiting for the SMS to arrive…
                                            </span>
                                            <button onClick={() => cancel(r.id)} disabled={cancelling === r.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.buttonRadius, border: `1px solid ${t.statusError}44`, background: t.statusErrorBg, color: t.statusError, fontSize: "0.78rem", fontWeight: 700, cursor: cancelling === r.id ? "not-allowed" : "pointer" }}>
                                                <X style={{ width: 13, height: 13 }} /> {cancelling === r.id ? "Cancelling…" : "Cancel"}
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>

                    {/* History */}
                    {history.length > 0 && (
                        <div style={card}>
                            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                                <h2 style={{ fontSize: "0.9rem", fontWeight: 700, color: t.textSecondary }}>History</h2>
                            </div>
                            {history.map((r, i) => {
                                const m = statusMeta(r.status);
                                return (
                                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px 110px", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < history.length - 1 ? `1px solid ${t.borderSecondary}` : "none" }}>
                                        <span style={{ fontSize: "0.85rem", color: t.textPrimary, fontWeight: 600 }}>{r.service?.name ?? "Service"}</span>
                                        <span style={{ fontSize: "0.8rem", color: t.textMuted, fontFamily: t.fontMono }}>{r.phoneNumber ?? "—"}</span>
                                        <span style={{ fontSize: "0.75rem", color: t.textMuted }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                                        <span style={{ justifySelf: "end", padding: "3px 10px", borderRadius: 12, background: m.bg, color: m.color, fontSize: "0.68rem", fontWeight: 700 }}>{m.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
