"use client";

import { useState, useEffect, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { SlidersHorizontal, Server, Coins, Shield, ToggleLeft, ToggleRight, Save, CheckCircle2, AlertCircle, Loader2, RefreshCw } from "lucide-react";

interface Settings {
    proxmox_node_ip?: string;
    truenas_endpoint?: string;
    credit_vnd_rate?: string;
    credit_min_topup?: string;
    trial_duration_days?: string;
    maintenance_mode?: string;
    registration_enabled?: string;
}

type SettingKey = keyof Settings;

const SECTIONS = [
    {
        id: "infra",
        label: "Infrastructure",
        icon: Server,
        description: "Node endpoints and service URLs",
        fields: [
            { key: "proxmox_node_ip" as SettingKey, label: "Proxmox Node IP / URL", placeholder: "https://proxmox.lan:8006", type: "text" },
            { key: "truenas_endpoint" as SettingKey, label: "TrueNAS API Endpoint", placeholder: "https://truenas.lan/api/v2.0", type: "text" },
        ],
    },
    {
        id: "economy",
        label: "Economy",
        icon: Coins,
        description: "Credit conversion rates and top-up limits",
        fields: [
            { key: "credit_vnd_rate" as SettingKey, label: "VND per 1 Credit", placeholder: "1000", type: "number" },
            { key: "credit_min_topup" as SettingKey, label: "Minimum Top-Up (Credits)", placeholder: "500", type: "number" },
        ],
    },
    {
        id: "platform",
        label: "Platform",
        icon: Shield,
        description: "Registration, maintenance, and trial settings",
        fields: [
            { key: "trial_duration_days" as SettingKey, label: "Trial VM Lifetime (Days)", placeholder: "3", type: "number" },
        ],
    },
];

export default function AdminSettingsPage() {
    const t = useThemeTokens();
    const [settings, setSettings] = useState<Settings>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState("");
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/settings");
            if (res.ok) { const d = await res.json(); setSettings(d.settings ?? {}); }
        } catch { setError("Failed to load settings."); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async (section: string, keys: SettingKey[]) => {
        setSaving(section); setError(""); setSuccess("");
        const payload: Record<string, string> = {};
        keys.forEach(k => { if (settings[k] !== undefined) payload[k] = settings[k]!; });
        try {
            const res = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error("Failed to save");
            setSuccess("Settings saved successfully.");
            setTimeout(() => setSuccess(""), 3000);
        } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
        finally { setSaving(null); }
    };

    const toggle = (key: SettingKey) => setSettings(s => ({ ...s, [key]: s[key] === "true" ? "false" : "true" }));
    const update = (key: SettingKey, val: string) => setSettings(s => ({ ...s, [key]: val }));

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow, marginBottom: 16 };
    const inp: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.isMono ? 4 : 8, color: t.textPrimary, fontSize: "0.875rem", outline: "none", padding: "9px 12px", fontFamily: t.fontFamily, width: "100%", boxSizing: "border-box" as const };
    const label: React.CSSProperties = { fontSize: "0.75rem", fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.02em" };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 4 }}>Admin System &bull; System Settings</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: t.statusWarningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <SlidersHorizontal style={{ width: 20, height: 20, color: t.statusWarning }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: t.textPrimary }}>System Settings</h1>
                            <p style={{ fontSize: "0.82rem", color: t.textMuted }}>Global platform configuration variables.</p>
                        </div>
                    </div>
                    <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: t.isMono ? 4 : 8, border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textMuted, fontSize: "0.8rem", cursor: "pointer" }}>
                        <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
                    </button>
                </div>
            </div>

            {/* Toasts */}
            {success && <div style={{ padding: "10px 16px", borderRadius: t.isMono ? 4 : 8, background: t.statusSuccessBg, border: `1px solid ${t.statusSuccess}33`, color: t.statusSuccess, marginBottom: 16, fontSize: "0.875rem", display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 style={{ width: 14, height: 14 }} />{success}</div>}
            {error && <div style={{ padding: "10px 16px", borderRadius: t.isMono ? 4 : 8, background: t.statusErrorBg, border: `1px solid ${t.statusError}33`, color: t.statusError, marginBottom: 16, fontSize: "0.875rem", display: "flex", alignItems: "center", gap: 8 }}><AlertCircle style={{ width: 14, height: 14 }} />{error}</div>}

            {loading ? (
                <div style={{ padding: "60px", textAlign: "center", color: t.textMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> Loading settings...
                </div>
            ) : (
                <>
                    {SECTIONS.map(section => (
                        <div key={section.id} style={card}>
                            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 10 }}>
                                <section.icon style={{ width: 16, height: 16, color: t.accentPrimary }} />
                                <div>
                                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>{section.label}</span>
                                    <span style={{ marginLeft: 8, fontSize: "0.75rem", color: t.textMuted }}>{section.description}</span>
                                </div>
                            </div>
                            <div style={{ padding: "18px 18px 14px" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
                                    {section.fields.map(field => (
                                        <div key={field.key}>
                                            <label style={label}>{field.label}</label>
                                            <input
                                                type={field.type}
                                                value={settings[field.key] ?? ""}
                                                onChange={e => update(field.key, e.target.value)}
                                                placeholder={field.placeholder}
                                                style={inp}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => save(section.id, section.fields.map(f => f.key))}
                                    disabled={saving === section.id}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>
                                    {saving === section.id ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Save style={{ width: 13, height: 13 }} />}
                                    Save {section.label}
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Platform toggles */}
                    <div style={card}>
                        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", gap: 10 }}>
                            <Shield style={{ width: 16, height: 16, color: t.accentPrimary }} />
                            <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>Platform Toggles</span>
                        </div>
                        <div style={{ padding: "18px" }}>
                            {[
                                { key: "maintenance_mode" as SettingKey, label: "Maintenance Mode", desc: "When enabled, the platform shows a maintenance page to all users." },
                                { key: "registration_enabled" as SettingKey, label: "New Registrations", desc: "Allow new users to create accounts." },
                            ].map(toggle_ => {
                                const on = settings[toggle_.key] === "true";
                                return (
                                    <div key={toggle_.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${t.borderSecondary}` }}>
                                        <div>
                                            <p style={{ fontWeight: 600, color: t.textPrimary, fontSize: "0.875rem" }}>{toggle_.label}</p>
                                            <p style={{ fontSize: "0.75rem", color: t.textMuted, marginTop: 2 }}>{toggle_.desc}</p>
                                        </div>
                                        <button onClick={() => toggle(toggle_.key)} style={{ background: "none", border: "none", cursor: "pointer", color: on ? t.statusSuccess : t.textMuted, display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", fontWeight: 700 }}>
                                            {on ? <ToggleRight style={{ width: 28, height: 28 }} /> : <ToggleLeft style={{ width: 28, height: 28 }} />}
                                            {on ? "On" : "Off"}
                                        </button>
                                    </div>
                                );
                            })}
                            <button onClick={() => save("platform", ["trial_duration_days", "maintenance_mode", "registration_enabled"])}
                                disabled={saving === "platform"}
                                style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>
                                {saving === "platform" ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Save style={{ width: 13, height: 13 }} />}
                                Save Platform Settings
                            </button>
                        </div>
                    </div>
                </>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
