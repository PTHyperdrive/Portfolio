"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type ThemeId = "slop" | "mono-dark" | "mono-light";

interface ThemeContextValue {
    theme: ThemeId;
    setTheme: (t: ThemeId) => void;
    cycleTheme: () => void;
}

const CYCLE_ORDER: ThemeId[] = ["slop", "mono-dark", "mono-light"];
const STORAGE_KEY = "nrsp-theme";

const ThemeContext = createContext<ThemeContextValue>({
    theme: "mono-dark",
    setTheme: () => {},
    cycleTheme: () => {},
});

export function useTheme() {
    return useContext(ThemeContext);
}

function getInitialTheme(): ThemeId {
    if (typeof window === "undefined") return "slop";
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && CYCLE_ORDER.includes(stored as ThemeId)) return stored as ThemeId;
    return "mono-dark";
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeId>("mono-dark");
    const [mounted, setMounted] = useState(false);

    // Read from localStorage on mount
    useEffect(() => {
        setThemeState(getInitialTheme());
        setMounted(true);
    }, []);

    // Apply data-theme attribute to <html> whenever theme changes
    useEffect(() => {
        if (!mounted) return;
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme, mounted]);

    const setTheme = useCallback((t: ThemeId) => {
        setThemeState(t);
    }, []);

    const cycleTheme = useCallback(() => {
        setThemeState((prev) => {
            const idx = CYCLE_ORDER.indexOf(prev);
            return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
        });
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, cycleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
