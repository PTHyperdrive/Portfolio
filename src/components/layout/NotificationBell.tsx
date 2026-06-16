"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Bell, Check } from "lucide-react";

interface NotiItem {
    id: string;
    source: string;
    title: string;
    body: string;
    read: boolean;
    createdAt: string;
    link: string | null;
}

/** Bell + unread badge + dropdown feed. Polls /api/notifications every 30s. */
export default function NotificationBell() {
    const t = useThemeTokens();
    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(0);
    const [items, setItems] = useState<NotiItem[]>([]);
    const ref = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            const r = await fetch("/api/notifications");
            if (r.ok) { const d = await r.json(); setUnread(d.unread ?? 0); setItems(d.notifications ?? []); }
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        load();
        const iv = setInterval(load, 30_000);
        return () => clearInterval(iv);
    }, [load]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const markAll = async () => {
        try { await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }); } catch { /* silent */ }
        setUnread(0);
        setItems(prev => prev.map(i => ({ ...i, read: true })));
    };

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button
                onClick={() => { setOpen(o => !o); load(); }}
                aria-label="Notifications"
                style={{
                    position: "relative", width: 38, height: 38, borderRadius: t.buttonRadius,
                    border: `1px solid ${t.borderPrimary}`, background: "transparent", color: t.textSecondary,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
            >
                <Bell style={{ width: 18, height: 18 }} />
                {unread > 0 && (
                    <span style={{
                        position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 4px",
                        borderRadius: 8, background: t.statusError, color: "#fff", fontSize: "0.6rem", fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{unread > 99 ? "99+" : unread}</span>
                )}
            </button>

            {open && (
                <div style={{
                    position: "absolute", right: 0, top: 46, width: 340, maxWidth: "90vw", zIndex: 9000,
                    background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)", overflow: "hidden",
                }}>
                    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.9rem", color: t.textPrimary }}>Notifications</span>
                        {unread > 0 && (
                            <button onClick={markAll} style={{ background: "none", border: "none", color: t.accentPrimary, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <Check style={{ width: 12, height: 12 }} /> Mark all read
                            </button>
                        )}
                    </div>
                    <div style={{ maxHeight: 380, overflowY: "auto" }}>
                        {items.length === 0 ? (
                            <p style={{ padding: "28px 16px", textAlign: "center", color: t.textMuted, fontSize: "0.82rem" }}>No notifications.</p>
                        ) : items.map(n => {
                            const inner = (
                                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.borderSecondary}`, background: n.read ? "transparent" : t.accentPrimaryMuted, display: "flex", gap: 10 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: n.read ? "transparent" : t.accentPrimary, marginTop: 6, flexShrink: 0 }} />
                                    <div style={{ minWidth: 0 }}>
                                        <p style={{ fontSize: "0.82rem", fontWeight: 700, color: t.textPrimary }}>{n.title}</p>
                                        <p style={{ fontSize: "0.76rem", color: t.textSecondary, lineHeight: 1.4 }}>{n.body}</p>
                                        <p style={{ fontSize: "0.68rem", color: t.textMuted, marginTop: 3 }}>{new Date(n.createdAt).toLocaleString()}</p>
                                    </div>
                                </div>
                            );
                            return n.link
                                ? <Link key={n.id} href={n.link} onClick={() => setOpen(false)} style={{ textDecoration: "none", display: "block" }}>{inner}</Link>
                                : <div key={n.id}>{inner}</div>;
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
