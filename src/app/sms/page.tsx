"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useCredits } from "@/components/CreditProvider";
import TwoFactorModal from "@/components/TwoFactorModal";
import {
    Smartphone, Search, ChevronDown, AlertTriangle, LogIn, Loader2, MessageSquareText,
} from "lucide-react";

interface SmsServiceCard {
    id: string; code: string; name: string; country: string; priceCredits: number; iconUrl: string | null;
}

const DEFAULT_RATE = 26305; // credits per USD — fallback if pricing API is unavailable

export default function SmsCatalogPage() {
    const t = useThemeTokens();
    const router = useRouter();
    const { status: authStatus } = useSession();
    const isAuthenticated = authStatus === "authenticated";
    const { credits } = useCredits();

    const [services, setServices] = useState<SmsServiceCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [country, setCountry] = useState("all");
    const [sortBy, setSortBy] = useState("default");
    const [rate, setRate] = useState(DEFAULT_RATE);

    const [rentingId, setRentingId] = useState<string | null>(null);
    const [err, setErr] = useState("");

    // TOTP step-up for renting
    const [show2fa, setShow2fa] = useState(false);
    const [twoFaError, setTwoFaError] = useState("");
    const [twoFaLoading, setTwoFaLoading] = useState(false);
    const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/sms/services");
            if (res.ok) { const d = await res.json(); setServices(d.services ?? []); }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        fetch("/api/admin/pricing").then(r => r.ok ? r.json() : null).then((d: { exchangeRate?: number } | null) => {
            if (d?.exchangeRate) setRate(d.exchangeRate);
        }).catch(() => { /* keep default */ });
    }, []);

    const usd = (creditsAmt: number) => `$${(creditsAmt / rate).toFixed(2)}`;

    const countries = useMemo(() => Array.from(new Set(services.map(s => s.country))).sort(), [services]);

    const displayed = useMemo(() => {
        let r = [...services];
        if (search) { const q = search.toLowerCase(); r = r.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)); }
        if (country !== "all") r = r.filter(s => s.country === country);
        if (sortBy === "price-asc") r.sort((a, b) => a.priceCredits - b.priceCredits);
        else if (sortBy === "price-desc") r.sort((a, b) => b.priceCredits - a.priceCredits);
        else if (sortBy === "name-asc") r.sort((a, b) => a.name.localeCompare(b.name));
        return r;
    }, [services, search, country, sortBy]);

    const rent = useCallback(async (serviceId: string, totpToken?: string) => {
        setRentingId(serviceId);
        setErr(""); setTwoFaError("");
        try {
            const res = await fetch("/api/sms/rentals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serviceId, totpToken }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.error === "2FA_REQUIRED") { setPendingServiceId(serviceId); setShow2fa(true); return; }
                if (data.error === "INVALID_2FA" || data.error === "2FA_RATE_LIMITED") { setTwoFaError(data.message || "Verification failed."); return; }
                if (res.status === 402) { setErr(`Not enough credits — you need ${data.required?.toLocaleString?.() ?? ""} to rent this number.`); return; }
                setErr(data.error || "Could not rent a number."); return;
            }
            setShow2fa(false); setPendingServiceId(null);
            router.push("/sms/rentals");
        } catch {
            setErr("Network error. Please try again.");
        } finally {
            setRentingId(null);
            setTwoFaLoading(false);
        }
    }, [router]);

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };

    return (
        <div style={{ padding: "28px 32px", minHeight: "100vh" }}>
            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.75rem", color: t.textMuted, marginBottom: 6 }}>TimoSMS &bull; Storefront</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
                        <Smartphone style={{ width: 22, height: 22, color: t.accentPrimary }} /> Rent a Number
                    </h1>
                    {!isAuthenticated && authStatus !== "loading" && (
                        <Link href="/auth/login" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, textDecoration: "none", color: t.textSecondary, fontSize: "0.78rem", fontWeight: 600 }}>
                            <LogIn style={{ width: 13, height: 13 }} /> Sign in to rent
                        </Link>
                    )}
                </div>
                <p style={{ fontSize: "0.82rem", color: t.textMuted, marginTop: 6, maxWidth: 620, lineHeight: 1.5 }}>
                    Rent a temporary number to receive a one-time SMS code. You&apos;re only charged when a code arrives — cancelled or expired rentals are free.
                </p>
            </div>

            {/* Toolbar */}
            <div style={{ ...card, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 8 }}>
                    <Search style={{ width: 14, height: 14, color: t.textMuted, flexShrink: 0 }} />
                    <input id="sms-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services (Google, Telegram…)"
                        style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: t.textPrimary, fontSize: "0.85rem", fontFamily: t.fontFamily }} />
                </div>
                <SelectBox id="sms-country" value={country} onChange={setCountry} t={t}
                    options={[{ value: "all", label: "All countries" }, ...countries.map(c => ({ value: c, label: c }))]} />
                <SelectBox id="sms-sort" value={sortBy} onChange={setSortBy} t={t}
                    options={[{ value: "default", label: "Default" }, { value: "price-asc", label: "Price ↑" }, { value: "price-desc", label: "Price ↓" }, { value: "name-asc", label: "Name A–Z" }]} />
                <span style={{ fontSize: "0.72rem", color: t.textMuted }}>{displayed.length} service{displayed.length !== 1 ? "s" : ""}</span>
            </div>

            {err && (
                <div style={{ ...card, padding: "12px 16px", marginBottom: 16, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} /> {err}
                    {/insufficient|not enough/i.test(err) && <Link href="/dashboard/billing/topup" style={{ marginLeft: "auto", color: t.accentPrimary, fontWeight: 700, textDecoration: "none" }}>Top up →</Link>}
                </div>
            )}

            {/* Price chart grid */}
            {loading ? (
                <div style={{ ...card, padding: "56px 40px", textAlign: "center", color: t.textMuted }}>Loading services…</div>
            ) : displayed.length === 0 ? (
                <div style={{ ...card, padding: "56px 40px", textAlign: "center" }}>
                    <MessageSquareText style={{ width: 28, height: 28, color: t.accentPrimary, margin: "0 auto 12px" }} />
                    <h3 style={{ fontWeight: 700, marginBottom: 8, fontSize: "1.1rem", color: t.textPrimary }}>No services available</h3>
                    <p style={{ color: t.textMuted, fontSize: "0.875rem" }}>{search ? "Nothing matches your search." : "The catalog is empty — check back soon."}</p>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                    {displayed.map(s => {
                        const busy = rentingId === s.id;
                        const affordable = credits >= s.priceCredits;
                        return (
                            <div key={s.id} style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 12, transition: "all 0.2s ease" }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = t.accentPrimary; e.currentTarget.style.transform = "translateY(-2px)"; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = t.borderPrimary; e.currentTarget.style.transform = "none"; }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ width: 38, height: 38, borderRadius: t.buttonRadius, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 800, color: t.accentPrimary, fontSize: "0.95rem" }}>
                                        {s.name[0]?.toUpperCase() ?? "#"}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <p style={{ fontWeight: 700, fontSize: "0.95rem", color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</p>
                                        <p style={{ fontSize: "0.72rem", color: t.textMuted, fontFamily: t.fontMono }}>{s.country}</p>
                                    </div>
                                </div>

                                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                    <span style={{ fontSize: "1.15rem", fontWeight: 800, color: t.textPrimary }}>{s.priceCredits.toLocaleString()}</span>
                                    <span style={{ fontSize: "0.72rem", color: t.textMuted }}>credits</span>
                                    <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: t.accentPrimary, fontWeight: 700, fontFamily: t.fontMono }}>{usd(s.priceCredits)}</span>
                                </div>

                                <button
                                    id={`sms-rent-${s.code}`}
                                    onClick={() => isAuthenticated ? rent(s.id) : router.push("/auth/login")}
                                    disabled={busy || (isAuthenticated && !affordable)}
                                    style={{
                                        width: "100%", padding: "10px 16px", borderRadius: t.buttonRadius, border: "none",
                                        background: (isAuthenticated && !affordable) ? t.bgTertiary : (t.isMono ? t.accentPrimary : "linear-gradient(135deg,#3b82f6,#2563eb)"),
                                        color: (isAuthenticated && !affordable) ? t.textMuted : (t.isMono ? t.bgPrimary : "#fff"),
                                        fontWeight: 700, fontSize: "0.82rem",
                                        cursor: busy || (isAuthenticated && !affordable) ? "not-allowed" : "pointer",
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                    }}>
                                    {busy ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                                        : (isAuthenticated && !affordable) ? "Insufficient credits" : "Rent number"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <TwoFactorModal
                open={show2fa}
                onClose={() => { setShow2fa(false); setTwoFaError(""); setTwoFaLoading(false); setPendingServiceId(null); }}
                onSubmit={(token) => { setTwoFaLoading(true); if (pendingServiceId) rent(pendingServiceId, token); }}
                loading={twoFaLoading}
                error={twoFaError}
            />

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// Small themed select used in the toolbar.
function SelectBox({ id, value, onChange, options, t }: {
    id: string; value: string; onChange: (v: string) => void;
    options: { value: string; label: string }[];
    t: ReturnType<typeof useThemeTokens>;
}) {
    return (
        <div style={{ position: "relative" }}>
            <select id={id} value={value} onChange={e => onChange(e.target.value)}
                style={{ padding: "7px 30px 7px 12px", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "0.8rem", fontFamily: t.fontFamily, appearance: "none", cursor: "pointer", outline: "none" }}>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: t.textMuted, pointerEvents: "none" }} />
        </div>
    );
}
