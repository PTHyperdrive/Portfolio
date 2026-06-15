"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Smartphone, Plus, Pencil, Trash2, X, Check, AlertTriangle } from "lucide-react";

interface Service {
    id: string; code: string; name: string; country: string; priceCredits: number;
    providerServiceCode: string | null; iconUrl: string | null; active: boolean; sortOrder: number;
}
interface RentalRow {
    id: string; user: string; service: string; phoneNumber: string | null; country: string;
    status: string; priceCredits: number; charged: boolean; createdAt: string;
}

type Draft = {
    id?: string; code: string; name: string; country: string; priceCredits: string;
    providerServiceCode: string; active: boolean; sortOrder: string;
};

const EMPTY: Draft = { code: "", name: "", country: "VN", priceCredits: "", providerServiceCode: "", active: true, sortOrder: "0" };

export default function AdminSmsPage() {
    const t = useThemeTokens();
    const [services, setServices] = useState<Service[]>([]);
    const [rentals, setRentals] = useState<RentalRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [msg, setMsg] = useState("");
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [sRes, rRes] = await Promise.all([
                fetch("/api/admin/sms/services"),
                fetch("/api/admin/sms/rentals"),
            ]);
            if (sRes.ok) setServices((await sRes.json()).services ?? []);
            if (rRes.ok) setRentals((await rRes.json()).rentals ?? []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        if (!draft) return;
        setBusy(true); setErr(""); setMsg("");
        const price = Number(draft.priceCredits);
        if (!draft.code.trim() || !draft.name.trim()) { setErr("Code and name are required."); setBusy(false); return; }
        if (!Number.isInteger(price) || price < 0) { setErr("Price must be a non-negative whole number of credits."); setBusy(false); return; }

        const payload = {
            code: draft.code.trim(), name: draft.name.trim(), country: draft.country.trim() || "VN",
            priceCredits: price, providerServiceCode: draft.providerServiceCode.trim() || null,
            active: draft.active, sortOrder: Number(draft.sortOrder) || 0,
        };
        try {
            const res = draft.id
                ? await fetch(`/api/admin/sms/services/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
                : await fetch("/api/admin/sms/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const d = await res.json();
            if (!res.ok) { setErr(d.error || "Save failed."); return; }
            setMsg(draft.id ? "Service updated." : "Service created.");
            setDraft(null);
            load();
        } catch { setErr("Network error."); }
        finally { setBusy(false); }
    };

    const del = async (id: string) => {
        setBusy(true); setErr("");
        try {
            const res = await fetch(`/api/admin/sms/services/${id}`, { method: "DELETE" });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setErr(d.error || "Delete failed."); }
            else { setMsg("Service deleted."); load(); }
        } catch { setErr("Network error."); }
        finally { setBusy(false); setDeleteId(null); }
    };

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 12px", background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.buttonRadius, color: t.textPrimary, fontSize: "0.85rem", outline: "none", fontFamily: "inherit" };
    const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.7rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };
    const statusColor = (s: string) => s === "RECEIVED" ? t.statusSuccess : s === "WAITING" ? t.statusWarning : t.textMuted;

    return (
        <div style={{ padding: "28px 32px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
                    <Smartphone style={{ width: 22, height: 22, color: t.accentPrimary }} /> TimoSMS — Services
                </h1>
                <button id="sms-admin-add" onClick={() => { setDraft({ ...EMPTY }); setErr(""); setMsg(""); }} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>
                    <Plus style={{ width: 15, height: 15 }} /> Add Service
                </button>
            </div>

            {msg && <div style={{ ...card, padding: "10px 16px", marginBottom: 16, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, fontSize: "0.85rem" }}>{msg}</div>}
            {err && <div style={{ ...card, padding: "10px 16px", marginBottom: 16, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle style={{ width: 14, height: 14 }} /> {err}</div>}

            {/* Services table */}
            <div style={{ ...card, marginBottom: 32 }}>
                <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                    <h2 style={{ fontSize: "0.9rem", fontWeight: 700, color: t.textSecondary }}>Services & Pricing</h2>
                </div>
                {loading ? (
                    <div style={{ padding: 32, textAlign: "center", color: t.textMuted }}>Loading…</div>
                ) : services.length === 0 ? (
                    <div style={{ padding: 32, textAlign: "center", color: t.textMuted, fontSize: "0.875rem" }}>No services yet. Add one to populate the storefront.</div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr 1fr 0.6fr auto", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${t.borderSecondary}`, background: t.bgSecondary }}>
                            {["Service", "Country", "Price (cr)", "Provider code", "Active", ""].map(h => (
                                <span key={h} style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                            ))}
                        </div>
                        {services.map((s, i) => (
                            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr 1fr 0.6fr auto", gap: 12, alignItems: "center", padding: "12px 20px", borderBottom: i < services.length - 1 ? `1px solid ${t.borderSecondary}` : "none" }}>
                                <div>
                                    <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.88rem" }}>{s.name}</p>
                                    <p style={{ fontSize: "0.7rem", color: t.textMuted, fontFamily: t.fontMono }}>{s.code}</p>
                                </div>
                                <span style={{ fontSize: "0.82rem", color: t.textSecondary, fontFamily: t.fontMono }}>{s.country}</span>
                                <span style={{ fontSize: "0.85rem", color: t.accentPrimary, fontWeight: 700, fontFamily: t.fontMono }}>{s.priceCredits.toLocaleString()}</span>
                                <span style={{ fontSize: "0.78rem", color: t.textMuted, fontFamily: t.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.providerServiceCode || "—"}</span>
                                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: s.active ? t.statusSuccess : t.textMuted }}>{s.active ? "Yes" : "No"}</span>
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                    <button title="Edit" onClick={() => { setDraft({ id: s.id, code: s.code, name: s.name, country: s.country, priceCredits: String(s.priceCredits), providerServiceCode: s.providerServiceCode ?? "", active: s.active, sortOrder: String(s.sortOrder) }); setErr(""); setMsg(""); }}
                                        style={{ width: 30, height: 30, borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Pencil style={{ width: 13, height: 13 }} />
                                    </button>
                                    <button title="Delete" onClick={() => setDeleteId(s.id)}
                                        style={{ width: 30, height: 30, borderRadius: t.buttonRadius, border: `1px solid ${t.statusError}33`, background: t.statusErrorBg, color: t.statusError, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Trash2 style={{ width: 13, height: 13 }} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Recent rentals */}
            <div style={card}>
                <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.borderSecondary}` }}>
                    <h2 style={{ fontSize: "0.9rem", fontWeight: 700, color: t.textSecondary }}>Recent Rentals</h2>
                </div>
                {rentals.length === 0 ? (
                    <div style={{ padding: 32, textAlign: "center", color: t.textMuted, fontSize: "0.875rem" }}>No rentals yet.</div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr 0.8fr 0.8fr 1fr", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${t.borderSecondary}`, background: t.bgSecondary }}>
                            {["User", "Service", "Number", "Status", "Charged", "When"].map(h => (
                                <span key={h} style={{ fontSize: "0.68rem", fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                            ))}
                        </div>
                        {rentals.map((r, i) => (
                            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr 0.8fr 0.8fr 1fr", gap: 12, alignItems: "center", padding: "10px 20px", borderBottom: i < rentals.length - 1 ? `1px solid ${t.borderSecondary}` : "none", fontSize: "0.8rem" }}>
                                <span style={{ color: t.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.user}</span>
                                <span style={{ color: t.textPrimary, fontWeight: 600 }}>{r.service}</span>
                                <span style={{ color: t.textMuted, fontFamily: t.fontMono }}>{r.phoneNumber ?? "—"}</span>
                                <span style={{ color: statusColor(r.status), fontWeight: 700, fontSize: "0.72rem" }}>{r.status}</span>
                                <span style={{ color: r.charged ? t.statusSuccess : t.textMuted, fontWeight: 700, fontSize: "0.72rem" }}>{r.charged ? `${r.priceCredits.toLocaleString()} cr` : "—"}</span>
                                <span style={{ color: t.textMuted, fontSize: "0.72rem" }}>{new Date(r.createdAt).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add/Edit modal */}
            {draft && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: t.isLight ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setDraft(null); }}>
                    <div style={{ ...card, width: "100%", maxWidth: 480, padding: 0 }}>
                        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h2 style={{ fontWeight: 800, fontSize: "1.05rem", color: t.textPrimary }}>{draft.id ? "Edit service" : "Add service"}</h2>
                            <button onClick={() => setDraft(null)} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X style={{ width: 14, height: 14 }} /></button>
                        </div>
                        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div><label style={labelStyle}>Code</label><input value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} placeholder="google" style={input} /></div>
                                <div><label style={labelStyle}>Country</label><input value={draft.country} onChange={e => setDraft({ ...draft, country: e.target.value })} placeholder="VN" style={input} /></div>
                            </div>
                            <div><label style={labelStyle}>Display name</label><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Google / Gmail" style={input} /></div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div><label style={labelStyle}>Price (credits)</label><input value={draft.priceCredits} onChange={e => setDraft({ ...draft, priceCredits: e.target.value.replace(/\D/g, "") })} placeholder="10522" inputMode="numeric" style={{ ...input, fontFamily: t.fontMono }} /></div>
                                <div><label style={labelStyle}>Sort order</label><input value={draft.sortOrder} onChange={e => setDraft({ ...draft, sortOrder: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ ...input, fontFamily: t.fontMono }} /></div>
                            </div>
                            <div><label style={labelStyle}>Provider service code</label><input value={draft.providerServiceCode} onChange={e => setDraft({ ...draft, providerServiceCode: e.target.value })} placeholder="Telecom service id (optional)" style={{ ...input, fontFamily: t.fontMono }} /></div>
                            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                                <div onClick={() => setDraft({ ...draft, active: !draft.active })} style={{ width: 40, height: 22, borderRadius: 11, background: draft.active ? t.accentPrimary : `${t.textMuted}33`, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                                    <div style={{ position: "absolute", top: 3, left: draft.active ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                                </div>
                                <span style={{ fontSize: "0.84rem", color: t.textSecondary, fontWeight: 600 }}>Active (visible in storefront)</span>
                            </label>
                            {err && <p style={{ fontSize: "0.8rem", color: t.statusError }}>{err}</p>}
                            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                                <button onClick={() => setDraft(null)} style={{ padding: "9px 18px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}>Cancel</button>
                                <button onClick={save} disabled={busy} style={{ padding: "9px 22px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.85rem", cursor: busy ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    <Check style={{ width: 14, height: 14 }} /> {busy ? "Saving…" : "Save"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirm */}
            {deleteId && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: t.isLight ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setDeleteId(null); }}>
                    <div style={{ ...card, width: "100%", maxWidth: 380, padding: 24, border: `1px solid ${t.statusError}44` }}>
                        <h3 style={{ fontSize: "1.05rem", fontWeight: 800, color: t.textPrimary, marginBottom: 10 }}>Delete service?</h3>
                        <p style={{ fontSize: "0.85rem", color: t.textSecondary, lineHeight: 1.5, marginBottom: 20 }}>Services with rental history can&apos;t be deleted — disable them instead.</p>
                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                            <button onClick={() => setDeleteId(null)} style={{ padding: "9px 18px", borderRadius: t.buttonRadius, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary, fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}>Cancel</button>
                            <button onClick={() => del(deleteId)} disabled={busy} style={{ padding: "9px 18px", borderRadius: t.buttonRadius, border: "none", background: t.statusError, color: "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: busy ? "not-allowed" : "pointer" }}>{busy ? "Deleting…" : "Delete"}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
