"use client";

import { useMemo } from "react";
import { useTheme, type ThemeId } from "@/components/ThemeProvider";

export interface ThemeTokens {
    /* ─── Backgrounds ─── */
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    bgCard: string;
    bgCardHover: string;
    bgInput: string;

    /* ─── Borders ─── */
    borderPrimary: string;
    borderSecondary: string;

    /* ─── Text ─── */
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textInverse: string;

    /* ─── Accent ─── */
    accentPrimary: string;
    accentPrimaryHover: string;
    accentPrimaryMuted: string;
    accentSecondary: string;

    /* ─── Status ─── */
    statusSuccess: string;
    statusSuccessBg: string;
    statusWarning: string;
    statusWarningBg: string;
    statusError: string;
    statusErrorBg: string;

    /* ─── Misc ─── */
    shadow: string;
    cardRadius: number;
    buttonRadius: number;
    fontFamily: string;
    fontMono: string;

    /* ─── Helpers ─── */
    isMono: boolean;
    isLight: boolean;
}

const SLOP_TOKENS: ThemeTokens = {
    bgPrimary: "#0a0a0f",
    bgSecondary: "#12121a",
    bgTertiary: "#1a1a2e",
    bgCard: "#161b22",
    bgCardHover: "rgba(255,255,255,0.08)",
    bgInput: "rgba(255,255,255,0.04)",
    borderPrimary: "rgba(255,255,255,0.07)",
    borderSecondary: "rgba(255,255,255,0.04)",
    textPrimary: "#e8e8f0",
    textSecondary: "#a0a0b8",
    textMuted: "#6b6b80",
    textInverse: "#0a0a0f",
    accentPrimary: "#3b82f6",
    accentPrimaryHover: "#60a5fa",
    accentPrimaryMuted: "rgba(59,130,246,0.15)",
    accentSecondary: "#8b5cf6",
    statusSuccess: "#10b981",
    statusSuccessBg: "rgba(16,185,129,0.1)",
    statusWarning: "#f59e0b",
    statusWarningBg: "rgba(245,158,11,0.1)",
    statusError: "#ef4444",
    statusErrorBg: "rgba(239,68,68,0.1)",
    shadow: "0 4px 16px rgba(0,0,0,0.4)",
    cardRadius: 14,
    buttonRadius: 9,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontMono: "'JetBrains Mono', 'Fira Code', monospace",
    isMono: false,
    isLight: false,
};

const MONO_DARK_TOKENS: ThemeTokens = {
    bgPrimary: "#000000",
    bgSecondary: "#0a0a0a",
    bgTertiary: "#141414",
    bgCard: "#111111",
    bgCardHover: "#1a1a1a",
    bgInput: "#0a0a0a",
    borderPrimary: "rgba(255,255,255,0.10)",
    borderSecondary: "rgba(255,255,255,0.06)",
    textPrimary: "#ededed",
    textSecondary: "#9a9a9a",
    textMuted: "#5e5e5e",
    textInverse: "#0a0a0a",
    // Pure grayscale: primary affordance = white on dark.
    accentPrimary: "#ededed",
    accentPrimaryHover: "#ffffff",
    accentPrimaryMuted: "rgba(255,255,255,0.09)",
    accentSecondary: "#9a9a9a",
    // Status kept but desaturated — present for clarity, never colourful.
    statusSuccess: "#b8c7b8",
    statusSuccessBg: "rgba(184,199,184,0.08)",
    statusWarning: "#cfc4a3",
    statusWarningBg: "rgba(207,196,163,0.08)",
    statusError: "#d8a7a2",
    statusErrorBg: "rgba(216,167,162,0.08)",
    shadow: "none",
    cardRadius: 0,
    buttonRadius: 0,
    fontFamily: "'Roboto', system-ui, sans-serif",
    fontMono: "'Roboto Mono', 'JetBrains Mono', monospace",
    isMono: true,
    isLight: false,
};

const MONO_LIGHT_TOKENS: ThemeTokens = {
    bgPrimary: "#ffffff",
    bgSecondary: "#f8f9fa",
    bgTertiary: "#f1f3f4",
    bgCard: "#ffffff",
    bgCardHover: "#f8f9fa",
    bgInput: "#ffffff",
    borderPrimary: "#dadce0",
    borderSecondary: "#e8eaed",
    textPrimary: "#141414",
    textSecondary: "#5e5e5e",
    textMuted: "#8a8a8a",
    textInverse: "#ffffff",
    // Pure grayscale: primary affordance = near-black on white.
    accentPrimary: "#141414",
    accentPrimaryHover: "#000000",
    accentPrimaryMuted: "rgba(0,0,0,0.05)",
    accentSecondary: "#5e5e5e",
    statusSuccess: "#4a5a4a",
    statusSuccessBg: "rgba(74,90,74,0.06)",
    statusWarning: "#6b6147",
    statusWarningBg: "rgba(107,97,71,0.06)",
    statusError: "#7a4a45",
    statusErrorBg: "rgba(122,74,69,0.06)",
    shadow: "none",
    cardRadius: 0,
    buttonRadius: 0,
    fontFamily: "'Roboto', system-ui, sans-serif",
    fontMono: "'Roboto Mono', 'JetBrains Mono', monospace",
    isMono: true,
    isLight: true,
};

// ─── Pro: neutral base + a single teal/cyan accent, subtle elevation ──

const PRO_DARK_TOKENS: ThemeTokens = {
    bgPrimary: "#0b0e10",
    bgSecondary: "#11161a",
    bgTertiary: "#171d22",
    bgCard: "#12171b",
    bgCardHover: "#1a2127",
    bgInput: "#0e1316",
    borderPrimary: "rgba(255,255,255,0.09)",
    borderSecondary: "rgba(255,255,255,0.05)",
    textPrimary: "#e6edf0",
    textSecondary: "#9fb0b8",
    textMuted: "#62727a",
    textInverse: "#04201c",
    accentPrimary: "#2dd4bf",
    accentPrimaryHover: "#5eead4",
    accentPrimaryMuted: "rgba(45,212,191,0.13)",
    accentSecondary: "#22d3ee",
    statusSuccess: "#5fbf8a",
    statusSuccessBg: "rgba(95,191,138,0.12)",
    statusWarning: "#e0b15a",
    statusWarningBg: "rgba(224,177,90,0.12)",
    statusError: "#e06c6c",
    statusErrorBg: "rgba(224,108,108,0.12)",
    shadow: "0 1px 3px rgba(0,0,0,0.45)",
    cardRadius: 8,
    buttonRadius: 6,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontMono: "'JetBrains Mono', 'Roboto Mono', monospace",
    isMono: false,
    isLight: false,
};

const PRO_LIGHT_TOKENS: ThemeTokens = {
    bgPrimary: "#f7f9fa",
    bgSecondary: "#ffffff",
    bgTertiary: "#eef2f4",
    bgCard: "#ffffff",
    bgCardHover: "#f3f6f7",
    bgInput: "#ffffff",
    borderPrimary: "#dce4e7",
    borderSecondary: "#e9eef0",
    textPrimary: "#0f1b1f",
    textSecondary: "#4a5a60",
    textMuted: "#7d8c92",
    textInverse: "#ffffff",
    accentPrimary: "#0d9488",
    accentPrimaryHover: "#0f766e",
    accentPrimaryMuted: "rgba(13,148,136,0.09)",
    accentSecondary: "#0891b2",
    statusSuccess: "#2f9e58",
    statusSuccessBg: "rgba(47,158,88,0.09)",
    statusWarning: "#b07d10",
    statusWarningBg: "rgba(176,125,16,0.09)",
    statusError: "#c0392b",
    statusErrorBg: "rgba(192,57,43,0.08)",
    shadow: "0 1px 3px rgba(16,30,40,0.10)",
    cardRadius: 8,
    buttonRadius: 6,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontMono: "'JetBrains Mono', 'Roboto Mono', monospace",
    isMono: false,
    isLight: true,
};

const TOKEN_MAP: Record<ThemeId, ThemeTokens> = {
    slop: SLOP_TOKENS,
    "mono-dark": MONO_DARK_TOKENS,
    "mono-light": MONO_LIGHT_TOKENS,
    "pro-dark": PRO_DARK_TOKENS,
    "pro-light": PRO_LIGHT_TOKENS,
};

export function useThemeTokens(): ThemeTokens {
    const { theme } = useTheme();
    return useMemo(() => TOKEN_MAP[theme] ?? SLOP_TOKENS, [theme]);
}
