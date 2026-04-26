"use client";

import {
    createContext, useContext, useState, useCallback, useEffect,
    type ReactNode,
} from "react";
import { useSession } from "next-auth/react";

/* ═══════════════════════════════════════════════════════════════════
 *  CreditContext — Universal credit balance for all services.
 *
 *  Every service (VPS, MMO, Email, Storage, etc.) reads from and
 *  mutates this single global credit pool via the exposed hook.
 * ═══════════════════════════════════════════════════════════════════ */

type CreditContextValue = {
    /** Current credit balance (integer). */
    credits: number;
    /** True while the initial fetch is in-flight. */
    loading: boolean;
    /** Re-fetch the canonical balance from the server. Call after any
     *  purchase / top-up / deduction to re-sync the UI. */
    refresh: () => Promise<void>;
    /** Optimistically adjust the local balance without a server round-trip.
     *  Use negative values for deductions, positive for top-ups. */
    adjust: (delta: number) => void;
};

const CreditContext = createContext<CreditContextValue>({
    credits: 0,
    loading: true,
    refresh: async () => {},
    adjust: () => {},
});

export function CreditProvider({ children }: { children: ReactNode }) {
    const { status } = useSession();
    const [credits, setCredits] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchCredits = useCallback(async () => {
        try {
            const res = await fetch("/api/user/credits");
            if (res.ok) {
                const data = await res.json();
                setCredits(data.credits ?? 0);
            }
        } catch {
            /* silent — balance will remain stale until next refresh */
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-fetch when session becomes authenticated
    useEffect(() => {
        if (status === "authenticated") {
            fetchCredits();
        } else if (status === "unauthenticated") {
            setCredits(0);
            setLoading(false);
        }
    }, [status, fetchCredits]);

    const adjust = useCallback((delta: number) => {
        setCredits((prev) => Math.max(0, prev + delta));
    }, []);

    return (
        <CreditContext.Provider
            value={{ credits, loading, refresh: fetchCredits, adjust }}
        >
            {children}
        </CreditContext.Provider>
    );
}

/**
 * Universal hook — use this in any component or service to
 * read / mutate the global credit pool.
 *
 * @example
 *   const { credits, refresh, adjust } = useCredits();
 *   // After a purchase:
 *   adjust(-totalCost);          // instant UI update
 *   await refresh();             // sync with server
 */
export function useCredits(): CreditContextValue {
    return useContext(CreditContext);
}
