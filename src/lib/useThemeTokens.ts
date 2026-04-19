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
    bgPrimary: "#1a1a1a",
    bgSecondary: "#232323",
    bgTertiary: "#2d2d2d",
    bgCard: "#292929",
    bgCardHover: "#303030",
    bgInput: "#232323",
    borderPrimary: "rgba(255,255,255,0.12)",
    borderSecondary: "rgba(255,255,255,0.06)",
    textPrimary: "#e8eaed",
    textSecondary: "#9aa0a6",
    textMuted: "#5f6368",
    textInverse: "#202124",
    accentPrimary: "#8ab4f8",
    accentPrimaryHover: "#aecbfa",
    accentPrimaryMuted: "rgba(138,180,248,0.12)",
    accentSecondary: "#8ab4f8",
    statusSuccess: "#81c995",
    statusSuccessBg: "rgba(129,201,149,0.1)",
    statusWarning: "#fdd663",
    statusWarningBg: "rgba(253,214,99,0.1)",
    statusError: "#f28b82",
    statusErrorBg: "rgba(242,139,130,0.1)",
    shadow: "0 1px 3px rgba(0,0,0,0.3)",
    cardRadius: 8,
    buttonRadius: 4,
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
    textPrimary: "#202124",
    textSecondary: "#5f6368",
    textMuted: "#80868b",
    textInverse: "#ffffff",
    accentPrimary: "#1a73e8",
    accentPrimaryHover: "#1765cc",
    accentPrimaryMuted: "rgba(26,115,232,0.08)",
    accentSecondary: "#1a73e8",
    statusSuccess: "#188038",
    statusSuccessBg: "rgba(24,128,56,0.06)",
    statusWarning: "#e37400",
    statusWarningBg: "rgba(227,116,0,0.06)",
    statusError: "#d93025",
    statusErrorBg: "rgba(217,48,37,0.06)",
    shadow: "0 1px 3px rgba(60,64,67,0.15)",
    cardRadius: 8,
    buttonRadius: 4,
    fontFamily: "'Roboto', system-ui, sans-serif",
    fontMono: "'Roboto Mono', 'JetBrains Mono', monospace",
    isMono: true,
    isLight: true,
};

const TOKEN_MAP: Record<ThemeId, ThemeTokens> = {
    slop: SLOP_TOKENS,
    "mono-dark": MONO_DARK_TOKENS,
    "mono-light": MONO_LIGHT_TOKENS,
};

export function useThemeTokens(): ThemeTokens {
    const { theme } = useTheme();
    return useMemo(() => TOKEN_MAP[theme] ?? SLOP_TOKENS, [theme]);
}
