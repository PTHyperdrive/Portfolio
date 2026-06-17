"use client";

import { useState, useEffect } from "react";

/**
 * True when the viewport width is at/below `breakpoint` (default 768px).
 *
 * SSR-safe: initialises to false on the server and reads the real width on the
 * first client render, then tracks `resize`. Use it to stack two-column
 * layouts, collapse padding, or swap a wide table for cards on mobile.
 *
 * Note: simple card/stat grids don't need this — prefer a CSS
 * `repeat(auto-fit, minmax(Npx, 1fr))` grid, which reflows with no JS.
 */
export function useIsMobile(breakpoint = 768): boolean {
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== "undefined" && window.innerWidth <= breakpoint,
    );
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= breakpoint);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, [breakpoint]);
    return isMobile;
}
