"use client";

import { useTheme, type ThemeId } from "@/components/ThemeProvider";

const THEME_META: Record<ThemeId, { label: string; icon: string; shortLabel: string }> = {
    slop: { label: "Slop Theme", icon: "🎨", shortLabel: "SLOP" },
    "mono-dark": { label: "Mono Dark", icon: "🌙", shortLabel: "DARK" },
    "mono-light": { label: "Mono Light", icon: "☀️", shortLabel: "LIGHT" },
};

/**
 * Compact theme toggle rendered as a small segmented pill.
 * `variant="sidebar"` renders a wider version for the sidebar footer.
 * `variant="navbar"` renders a compact cycle-button for the navbar.
 */
export default function ThemeToggle({ variant = "navbar" }: { variant?: "navbar" | "sidebar" }) {
    const { theme, setTheme, cycleTheme } = useTheme();
    const meta = THEME_META[theme];

    if (variant === "navbar") {
        return (
            <button
                onClick={cycleTheme}
                title={`Theme: ${meta.label} — Click to cycle`}
                aria-label={`Current theme: ${meta.label}. Click to switch.`}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border-primary, rgba(255,255,255,0.08))",
                    background: "var(--bg-tertiary, rgba(255,255,255,0.04))",
                    color: "var(--text-secondary, #9aa0a6)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    whiteSpace: "nowrap",
                    letterSpacing: "0.03em",
                }}
            >
                <span>{meta.icon}</span>
                <span>{meta.shortLabel}</span>
            </button>
        );
    }

    // Sidebar variant — segmented row
    return (
        <div
            style={{
                display: "flex",
                gap: 2,
                padding: 2,
                borderRadius: 8,
                background: "var(--bg-tertiary, rgba(255,255,255,0.04))",
                border: "1px solid var(--border-primary, rgba(255,255,255,0.08))",
                width: "100%",
            }}
        >
            {(Object.keys(THEME_META) as ThemeId[]).map((id) => {
                const m = THEME_META[id];
                const active = theme === id;
                return (
                    <button
                        key={id}
                        onClick={() => setTheme(id)}
                        title={m.label}
                        aria-label={m.label}
                        style={{
                            flex: 1,
                            padding: "5px 0",
                            borderRadius: 6,
                            border: "none",
                            background: active
                                ? "var(--accent-primary-muted, rgba(59,130,246,0.15))"
                                : "transparent",
                            color: active
                                ? "var(--accent-primary, #8ab4f8)"
                                : "var(--text-muted, #5f6368)",
                            fontSize: "0.68rem",
                            fontWeight: active ? 700 : 500,
                            cursor: "pointer",
                            transition: "all 0.15s",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                        }}
                    >
                        <span style={{ fontSize: "0.72rem" }}>{m.icon}</span>
                        <span>{m.shortLabel}</span>
                    </button>
                );
            })}
        </div>
    );
}
