"use client";

import { useState, useEffect } from "react";
import { HelpCircle, ChevronDown } from "lucide-react";

interface FaqEntry {
    id: string;
    question: string;
    answer: string;
    category: string;
}

export default function FaqPage() {
    const [grouped, setGrouped] = useState<Record<string, FaqEntry[]>>({});
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/cms/faq")
            .then(r => r.json())
            .then(data => {
                setGrouped(data.grouped ?? {});
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const toggle = (id: string) => setOpenId(prev => prev === id ? null : id);

    return (
        <div style={{ paddingTop: "100px", minHeight: "100vh" }}>
            <div className="container">
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: "60px" }}>
                    <span className="badge badge-cyan" style={{ marginBottom: "16px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <HelpCircle style={{ width: 14, height: 14 }} /> FAQ
                    </span>
                    <h1
                        style={{
                            fontSize: "clamp(2rem, 5vw, 3.5rem)",
                            fontWeight: 800,
                            marginBottom: "16px",
                            letterSpacing: "-0.03em",
                        }}
                    >
                        Frequently Asked <span className="gradient-text">Questions</span>
                    </h1>
                    <p style={{ color: "var(--text-secondary)", maxWidth: "550px", margin: "0 auto", fontSize: "1.05rem" }}>
                        Find answers to common questions about NRSP Cloud services, billing, and more.
                    </p>
                </div>

                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: "center", padding: "60px 0" }}>
                        <div style={{
                            width: 40, height: 40,
                            border: "3px solid var(--glass-border)",
                            borderTopColor: "var(--accent-cyan)",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                            margin: "0 auto 16px",
                        }} />
                        <p style={{ color: "var(--text-muted)" }}>Loading FAQs...</p>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}

                {/* Empty */}
                {!loading && Object.keys(grouped).length === 0 && (
                    <div className="glass-card" style={{ padding: "80px 40px", textAlign: "center", maxWidth: "500px", margin: "0 auto" }}>
                        <HelpCircle style={{ width: 40, height: 40, color: "var(--text-muted)", margin: "0 auto 16px" }} />
                        <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "8px" }}>No FAQs yet</h3>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                            Questions and answers are being prepared.
                        </p>
                    </div>
                )}

                {/* FAQ Accordion */}
                {!loading && Object.keys(grouped).length > 0 && (
                    <div style={{ maxWidth: 760, margin: "0 auto" }}>
                        {Object.entries(grouped).map(([category, items]) => (
                            <div key={category} style={{ marginBottom: 36 }}>
                                <h2 style={{
                                    fontSize: "0.82rem", fontWeight: 800,
                                    color: "var(--accent-cyan)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.12em",
                                    marginBottom: 14,
                                    paddingLeft: 4,
                                }}>
                                    {category}
                                </h2>
                                <div className="glass-card" style={{ overflow: "hidden", borderRadius: "var(--radius-lg)" }}>
                                    {items.map((entry, idx) => {
                                        const isOpen = openId === entry.id;
                                        return (
                                            <div key={entry.id}>
                                                <button
                                                    id={`faq-${entry.id}`}
                                                    onClick={() => toggle(entry.id)}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        width: "100%",
                                                        padding: "18px 24px",
                                                        background: "transparent",
                                                        border: "none",
                                                        cursor: "pointer",
                                                        textAlign: "left",
                                                        borderBottom: idx < items.length - 1 && !isOpen ? "1px solid var(--glass-border)" : "none",
                                                    }}
                                                >
                                                    <span style={{
                                                        fontSize: "0.95rem",
                                                        fontWeight: 600,
                                                        color: isOpen ? "var(--accent-cyan)" : "var(--text-primary)",
                                                        transition: "color 0.15s",
                                                    }}>
                                                        {entry.question}
                                                    </span>
                                                    <ChevronDown style={{
                                                        width: 18, height: 18,
                                                        color: "var(--text-muted)",
                                                        transition: "transform 0.25s",
                                                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                                                        flexShrink: 0,
                                                        marginLeft: 12,
                                                    }} />
                                                </button>
                                                {isOpen && (
                                                    <div style={{
                                                        padding: "0 24px 20px",
                                                        fontSize: "0.92rem",
                                                        lineHeight: 1.7,
                                                        color: "var(--text-secondary)",
                                                        whiteSpace: "pre-wrap",
                                                        borderBottom: idx < items.length - 1 ? "1px solid var(--glass-border)" : "none",
                                                    }}>
                                                        {entry.answer}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
