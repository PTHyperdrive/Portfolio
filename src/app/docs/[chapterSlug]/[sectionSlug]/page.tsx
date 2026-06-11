"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { useDocs } from "../../layout";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SectionData {
    id: string;
    title: string;
    slug: string;
    content: string;
    published: boolean;
    updatedAt: string;
    chapter: { id: string; title: string; slug: string };
}

export default function DocsSection() {
    const t = useThemeTokens();
    const { chapterSlug, sectionSlug } = useParams<{ chapterSlug: string; sectionSlug: string }>();
    const { chapters } = useDocs();

    const [section, setSection] = useState<SectionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!chapterSlug || !sectionSlug) return;
        setLoading(true);
        setError(false);

        // First find the chapter, then find the section by slug
        fetch(`/api/cms/manual/chapters/${chapterSlug}`)
            .then(r => r.json())
            .then(data => {
                if (!data.chapter) throw new Error("Chapter not found");
                // Flatten sections to find by slug
                const flatFind = (sections: Array<Record<string, unknown>>): Record<string, unknown> | null => {
                    for (const s of sections) {
                        if (s.slug === sectionSlug) return s;
                        const found = flatFind((s.children || []) as Array<Record<string, unknown>>);
                        if (found) return found;
                    }
                    return null;
                };
                const found = flatFind(data.chapter.sections);
                if (!found) throw new Error("Section not found");
                // Fetch full section content
                return fetch(`/api/cms/manual/sections/${found.id}`);
            })
            .then(r => r.json())
            .then(data => {
                if (!data.section) throw new Error("Section not found");
                setSection(data.section);
                setLoading(false);
            })
            .catch(() => {
                setError(true);
                setLoading(false);
            });
    }, [chapterSlug, sectionSlug]);

    // Build flat ordered list of all sections for prev/next navigation
    const flatSections = useMemo(() => {
        const result: Array<{ chapterSlug: string; slug: string; title: string }> = [];
        const flatten = (sections: Array<{ slug: string; title: string; children: Array<unknown> }>, chSlug: string) => {
            for (const s of sections) {
                result.push({ chapterSlug: chSlug, slug: s.slug, title: s.title });
                flatten(s.children as Array<{ slug: string; title: string; children: Array<unknown> }>, chSlug);
            }
        };
        for (const ch of chapters) {
            flatten(ch.sections as unknown as Array<{ slug: string; title: string; children: Array<unknown> }>, ch.slug);
        }
        return result;
    }, [chapters]);

    const currentIdx = flatSections.findIndex(
        s => s.chapterSlug === chapterSlug && s.slug === sectionSlug
    );
    const prev = currentIdx > 0 ? flatSections[currentIdx - 1] : null;
    const next = currentIdx < flatSections.length - 1 ? flatSections[currentIdx + 1] : null;

    const fmtDate = (s: string) =>
        new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    if (loading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh" }}>
                <p style={{ color: t.textMuted }}>Loading...</p>
            </div>
        );
    }

    if (error || !section) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh" }}>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: t.textPrimary, marginBottom: 8 }}>
                    Section Not Found
                </h2>
                <p style={{ color: t.textMuted, marginBottom: 20 }}>
                    The documentation section you requested does not exist.
                </p>
                <Link href="/docs" style={{
                    padding: "8px 20px", borderRadius: t.buttonRadius,
                    border: `1px solid ${t.borderPrimary}`, color: t.textSecondary,
                    textDecoration: "none", fontSize: "0.88rem",
                }}>
                    Back to Docs
                </Link>
            </div>
        );
    }

    return (
        <article>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, fontSize: "0.78rem", color: t.textMuted }}>
                <Link href="/docs" style={{ color: t.textMuted, textDecoration: "none" }}>Docs</Link>
                <ChevronRight style={{ width: 11, height: 11 }} />
                <span style={{ color: t.textSecondary }}>{section.chapter.title}</span>
                <ChevronRight style={{ width: 11, height: 11 }} />
                <span style={{ color: t.textPrimary, fontWeight: 600 }}>{section.title}</span>
            </div>

            {/* Title */}
            <h1 style={{
                fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
                fontWeight: 800, color: t.textPrimary,
                letterSpacing: "-0.03em", lineHeight: 1.2,
                marginBottom: 8,
            }}>
                {section.title}
            </h1>

            <p style={{ fontSize: "0.78rem", color: t.textMuted, fontFamily: t.fontMono, marginBottom: 32 }}>
                Last updated: {fmtDate(section.updatedAt)}
            </p>

            {/* Content */}
            <MarkdownRenderer content={section.content} />

            {/* Prev / Next Navigation */}
            <div style={{
                display: "flex", justifyContent: "space-between", gap: 16,
                marginTop: 48, paddingTop: 24,
                borderTop: `1px solid ${t.borderPrimary}`,
            }}>
                {prev ? (
                    <Link href={`/docs/${prev.chapterSlug}/${prev.slug}`} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "12px 20px", borderRadius: t.cardRadius,
                        border: `1px solid ${t.borderPrimary}`,
                        color: t.textSecondary, textDecoration: "none",
                        fontSize: "0.85rem", fontWeight: 600,
                        transition: "all 0.15s",
                    }}>
                        <ChevronLeft style={{ width: 14, height: 14 }} />
                        {prev.title}
                    </Link>
                ) : <div />}
                {next ? (
                    <Link href={`/docs/${next.chapterSlug}/${next.slug}`} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "12px 20px", borderRadius: t.cardRadius,
                        border: `1px solid ${t.borderPrimary}`,
                        color: t.textSecondary, textDecoration: "none",
                        fontSize: "0.85rem", fontWeight: 600,
                        transition: "all 0.15s",
                        marginLeft: "auto",
                    }}>
                        {next.title}
                        <ChevronRight style={{ width: 14, height: 14 }} />
                    </Link>
                ) : null}
            </div>
        </article>
    );
}
