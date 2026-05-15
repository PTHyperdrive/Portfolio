"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useDocs } from "./layout";
import { BookMarked } from "lucide-react";

/**
 * Docs landing page.
 * Redirects to the first published chapter's first section if available,
 * otherwise shows a "Manual coming soon" placeholder.
 */
export default function DocsLanding() {
    const t = useThemeTokens();
    const router = useRouter();
    const { chapters, loading } = useDocs();

    useEffect(() => {
        if (loading) return;
        // Find the first chapter with at least one section
        for (const ch of chapters) {
            if (ch.sections.length > 0) {
                router.replace(`/docs/${ch.slug}/${ch.sections[0].slug}`);
                return;
            }
        }
    }, [loading, chapters, router]);

    if (loading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh" }}>
                <p style={{ color: t.textMuted }}>Loading documentation...</p>
            </div>
        );
    }

    // If we didn't redirect, there's no content
    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", minHeight: "50vh", textAlign: "center",
        }}>
            <BookMarked style={{ width: 48, height: 48, color: t.borderSecondary, marginBottom: 20 }} />
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: t.textPrimary, marginBottom: 8 }}>
                User Manual
            </h1>
            <p style={{ color: t.textMuted, fontSize: "0.95rem", maxWidth: 400 }}>
                The documentation is currently being prepared. Check back soon for comprehensive guides on using NRSP Cloud services.
            </p>
        </div>
    );
}
