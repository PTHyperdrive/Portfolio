"use client";

import { useState } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { Users, UserPlus, Shield, Mail, Crown, Eye, Pencil, Trash2 } from "lucide-react";

const ROLES = [
    { id: "owner", label: "Owner", Icon: Crown, color: "#f59e0b", desc: "Full administrative access" },
    { id: "admin", label: "Admin", Icon: Shield, color: "#8ab4f8", desc: "Manage resources and users" },
    { id: "member", label: "Member", Icon: Eye, color: "#81c995", desc: "View and use resources" },
    { id: "billing", label: "Billing", Icon: Pencil, color: "#f28b82", desc: "Manage invoices and payments" },
];

export default function TeamPage() {
    const t = useThemeTokens();
    const [showInvite, setShowInvite] = useState(false);
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("member");

    const card: React.CSSProperties = { background: t.bgCard, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, boxShadow: t.shadow };
    const inputStyle: React.CSSProperties = { background: t.bgInput, border: `1px solid ${t.borderPrimary}`, borderRadius: t.cardRadius, color: t.textPrimary, fontSize: "0.875rem", outline: "none", padding: "9px 13px" };

    return (
        <div style={{ padding: "32px 36px", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: "0.78rem", color: t.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    Dashboard <span>&bull;</span>
                    <span style={{ color: t.accentPrimary, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: t.accentPrimaryMuted }}>Team Management</span>
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Users style={{ width: 22, height: 22, color: t.accentPrimary }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary }}>Team Management</h1>
                            <p style={{ fontSize: "0.83rem", color: t.textMuted }}>Invite members, assign roles, and manage access to your cloud resources.</p>
                        </div>
                    </div>
                    <button onClick={() => setShowInvite(!showInvite)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: "pointer" }}>
                        <UserPlus style={{ width: 14, height: 14 }} /> Invite Member
                    </button>
                </div>
            </div>

            {/* Invite Form (collapsible) */}
            {showInvite && (
                <div style={{ ...card, padding: "24px 28px", marginBottom: 24 }}>
                    <h3 style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                        <Mail style={{ width: 16, height: 16, color: t.accentPrimary }} /> Send Invitation
                    </h3>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Email Address</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ width: 180 }}>
                            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Role</label>
                            <select value={role} onChange={e => setRole(e.target.value)} style={{ ...inputStyle, width: "100%", cursor: "pointer", boxSizing: "border-box" }}>
                                <option value="admin">Admin</option>
                                <option value="member">Member</option>
                                <option value="billing">Billing</option>
                            </select>
                        </div>
                        <button style={{ padding: "9px 22px", borderRadius: t.buttonRadius, border: "none", background: t.accentPrimary, color: t.textInverse, fontWeight: 700, fontSize: "0.875rem", cursor: "pointer", whiteSpace: "nowrap" }}>
                            Send Invite
                        </button>
                    </div>
                </div>
            )}

            {/* Role Breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>
                {ROLES.map(r => (
                    <div key={r.id} style={{ ...card, padding: "18px 22px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${r.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <r.Icon style={{ width: 16, height: 16, color: r.color }} />
                            </div>
                            <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>{r.label}</span>
                        </div>
                        <p style={{ fontSize: "0.78rem", color: t.textMuted, lineHeight: 1.5 }}>{r.desc}</p>
                    </div>
                ))}
            </div>

            {/* Members Table — Empty State */}
            <div style={card}>
                <div style={{ padding: "16px 24px", borderBottom: `1px solid ${t.borderSecondary}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.95rem" }}>Team Members</span>
                    <span style={{ padding: "2px 10px", borderRadius: 10, background: t.accentPrimaryMuted, color: t.accentPrimary, fontSize: "0.72rem", fontWeight: 700 }}>1 member</span>
                </div>
                {/* Current user row (scrolls horizontally on narrow screens) */}
                <div style={{ overflowX: "auto" }}>
                <div style={{ padding: "14px 24px", display: "grid", gridTemplateColumns: "1fr 160px 100px 80px", alignItems: "center", gap: 12, borderBottom: `1px solid ${t.borderSecondary}`, minWidth: 560 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: t.accentPrimaryMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Crown style={{ width: 16, height: 16, color: "#f59e0b" }} />
                        </div>
                        <div>
                            <p style={{ fontWeight: 700, color: t.textPrimary, fontSize: "0.9rem" }}>You (Owner)</p>
                            <p style={{ fontSize: "0.78rem", color: t.textMuted, fontFamily: t.fontMono }}>your@email.com</p>
                        </div>
                    </div>
                    <span style={{ padding: "3px 10px", borderRadius: 6, background: `#f59e0b18`, color: "#f59e0b", fontSize: "0.75rem", fontWeight: 700, textAlign: "center" }}>Owner</span>
                    <span style={{ fontSize: "0.78rem", color: t.statusSuccess, fontWeight: 600 }}>Active</span>
                    <span style={{ fontSize: "0.78rem", color: t.textMuted }}>—</span>
                </div>
                </div>
                {/* Empty hint */}
                <div style={{ padding: "32px 24px", textAlign: "center" }}>
                    <p style={{ color: t.textMuted, fontSize: "0.875rem" }}>Invite team members to collaborate on your cloud infrastructure.</p>
                </div>
            </div>
        </div>
    );
}
