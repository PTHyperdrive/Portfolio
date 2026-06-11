"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { useSession } from "next-auth/react";

/**
 * ViewMode — lets an ADMIN preview the dashboard as a regular USER.
 *
 * This is a CLIENT-SIDE UI preview only. It hides admin-only controls so the
 * admin sees what customers see. It does NOT change real permissions — every
 * API route still enforces the true role server-side.
 *
 * `realAdmin`      — the account's actual role is ADMIN
 * `viewAsUser`     — admin has toggled the preview on
 * `effectiveAdmin` — realAdmin && !viewAsUser (use this to gate admin UI)
 */
interface ViewModeCtx {
    realAdmin: boolean;
    viewAsUser: boolean;
    effectiveAdmin: boolean;
    setViewAsUser: (v: boolean) => void;
}

const Ctx = createContext<ViewModeCtx>({
    realAdmin: false,
    viewAsUser: false,
    effectiveAdmin: false,
    setViewAsUser: () => {},
});

const STORAGE_KEY = "nrsp_view_as_user";

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
    const { data: session } = useSession();
    const realAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
    // Lazy initializer reads the saved preference once (guarded for SSR).
    const [viewAsUser, setViewAsUserState] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return localStorage.getItem(STORAGE_KEY) === "1";
    });

    const setViewAsUser = useCallback((v: boolean) => {
        setViewAsUserState(v);
        localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    }, []);

    // Non-admins can never be in "view as user" mode (it's meaningless).
    const effectiveViewAsUser = realAdmin && viewAsUser;

    return (
        <Ctx.Provider value={{
            realAdmin,
            viewAsUser: effectiveViewAsUser,
            effectiveAdmin: realAdmin && !effectiveViewAsUser,
            setViewAsUser,
        }}>
            {children}
        </Ctx.Provider>
    );
}

export const useViewMode = () => useContext(Ctx);
