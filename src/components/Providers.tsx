"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import ThemeProvider from "@/components/ThemeProvider";
import { CreditProvider } from "@/components/CreditProvider";

export default function Providers({
    children,
    session,
}: {
    children: React.ReactNode;
    session: Session | null;
}) {
    return (
        <SessionProvider session={session}>
            <CreditProvider>
                <ThemeProvider>{children}</ThemeProvider>
            </CreditProvider>
        </SessionProvider>
    );
}
