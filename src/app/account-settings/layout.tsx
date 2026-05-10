"use client";

import Link from "next/link";
import Image from "next/image";
import SessionGuard from "@/components/SessionGuard";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { ArrowLeft } from "lucide-react";

export default function AccountSettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const t = useThemeTokens();

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            width: "100%",
            overflow: "hidden",
            backgroundColor: t.bgPrimary,
            color: t.textPrimary,
            fontFamily: t.fontFamily,
        }}>
            <SessionGuard />

            {/* ── Fixed Top Bar ── */}
            <header style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 48px",
                borderBottom: `1px solid ${t.borderPrimary}`,
                flexShrink: 0,
                backgroundColor: t.bgPrimary,
                zIndex: 10,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Image
                        src="/logo.png" alt="NRSP Cloud" width={28} height={28}
                        style={{ objectFit: "contain", filter: t.isLight ? "none" : "brightness(0) invert(1)" }}
                    />
                    <span style={{
                        fontWeight: 800, fontSize: "1rem", color: t.textPrimary,
                        letterSpacing: "-0.02em",
                    }}>
                        Not<span style={{ color: t.accentPrimary }}>Respond</span>
                    </span>
                </div>
                <Link href="/dashboard" style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: "0.82rem", color: t.accentPrimary,
                    textDecoration: "none", fontWeight: 600,
                }}>
                    <ArrowLeft style={{ width: 14, height: 14 }} />
                    Back to Console
                </Link>
            </header>

            {/* ── Scrollable Content Area ── */}
            <main style={{
                flex: 1,
                overflowY: "auto",
                padding: "32px 48px 64px",
                position: "relative",
                display: "flex",
                justifyContent: "center",
            }}>
                {children}
            </main>
        </div>
    );
}
