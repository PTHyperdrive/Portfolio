"use client";

import { useState, useEffect, createContext, useContext, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useThemeTokens } from "@/lib/useThemeTokens";
import AccountDropdown from "@/components/layout/AccountDropdown";
import { ChevronRight, ChevronDown } from "lucide-react";

interface SectionNode {
    id: string;
    title: string;
    slug: string;
    published: boolean;
    children: SectionNode[];
}

interface Chapter {
    id: string;
    title: string;
    slug: string;
    icon: string | null;
    sections: SectionNode[];
}

interface DocsContextType {
    chapters: Chapter[];
    loading: boolean;
}

const DocsContext = createContext<DocsContextType>({ chapters: [], loading: true });
export const useDocs = () => useContext(DocsContext);

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    const t = useThemeTokens();
    const pathname = usePathname();
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

    const fetchChapters = useCallback(async () => {
        try {
            const res = await fetch("/api/cms/manual/chapters");
            const data = await res.json();
            setChapters(data.chapters ?? []);
            // Auto-expand chapter that matches current URL
            const segments = pathname.split("/");
            if (segments.length >= 3) {
                const chSlug = segments[2];
                const ch = (data.chapters ?? []).find((c: Chapter) => c.slug === chSlug);
                if (ch) setExpandedChapters(new Set([ch.id]));
            }
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, [pathname]);

    useEffect(() => { fetchChapters(); }, [fetchChapters]);

    const toggleChapter = (id: string) => {
        setExpandedChapters(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSection = (id: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // Check if a section or its children match the current URL
    const isActive = (chSlug: string, sSlug: string) =>
        pathname === `/docs/${chSlug}/${sSlug}`;

    const renderSectionTree = (sections: SectionNode[], chSlug: string, depth: number = 0): React.ReactNode => {
        return sections.map(section => {
            const active = isActive(chSlug, section.slug);
            const hasChildren = section.children.length > 0;
            const expanded = expandedSections.has(section.id);

            return (
                <div key={section.id}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                        {hasChildren && (
                            <button onClick={() => toggleSection(section.id)} style={{
                                background: "none", border: "none", cursor: "pointer", padding: "2px",
                                color: t.textMuted, display: "flex", marginLeft: depth * 14,
                            }}>
                                {expanded
                                    ? <ChevronDown style={{ width: 11, height: 11 }} />
                                    : <ChevronRight style={{ width: 11, height: 11 }} />
                                }
                            </button>
                        )}
                        <Link
                            href={`/docs/${chSlug}/${section.slug}`}
                            style={{
                                display: "block", flex: 1,
                                padding: "6px 12px",
                                paddingLeft: hasChildren ? 4 : 12 + depth * 14,
                                fontSize: "0.82rem",
                                fontWeight: active ? 700 : 400,
                                color: active ? t.statusWarning : t.textSecondary,
                                textDecoration: "none",
                                borderLeft: active
                                    ? `2px solid ${t.statusWarning}`
                                    : "2px solid transparent",
                                transition: "all 0.12s",
                            }}
                        >
                            {section.title}
                        </Link>
                    </div>
                    {hasChildren && expanded && renderSectionTree(section.children, chSlug, depth + 1)}
                </div>
            );
        });
    };

    return (
        <DocsContext.Provider value={{ chapters, loading }}>
            <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: t.bgPrimary }}>
                {/* ─── Top Navbar (mirrors Console Hub) ─── */}
                <nav style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 32px",
                    borderBottom: `1px solid ${t.borderPrimary}`,
                    background: t.isMono ? (t.isLight ? "#fff" : "#000") : t.bgSecondary,
                    position: "sticky", top: 0, zIndex: 100,
                }}>
                    <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                        <Image
                            src="/logo.png" alt="NRSP Cloud" width={28} height={28}
                            style={{ objectFit: "contain", filter: t.isLight ? "none" : "brightness(0) invert(1)" }}
                        />
                        <span style={{ fontWeight: 800, fontSize: "0.95rem", color: t.textPrimary, letterSpacing: "-0.02em" }}>
                            Not<span style={{ color: t.accentPrimary }}>Respond</span>
                        </span>
                    </Link>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {[
                            { label: "News", href: "/news" },
                            { label: "Blogs", href: "/blog" },
                            { label: "FAQs", href: "/faq" },
                            { label: "Docs", href: "/docs" },
                        ].map(link => (
                            <Link
                                key={link.href}
                                href={link.href}
                                style={{
                                    padding: "7px 14px", borderRadius: t.isMono ? 4 : 8,
                                    fontSize: "0.82rem", fontWeight: 600,
                                    color: pathname.startsWith(link.href) ? t.textPrimary : t.textSecondary,
                                    textDecoration: "none", transition: "all 0.15s",
                                    background: pathname.startsWith(link.href) ? t.bgCardHover : "transparent",
                                }}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>

                    <AccountDropdown />
                </nav>

                {/* ─── Main Layout ─── */}
                <div style={{ display: "flex", flex: 1 }}>
                    {/* Left — TOC Sidebar */}
                    <aside style={{
                        width: 280, minWidth: 280,
                        borderRight: `1px solid ${t.borderPrimary}`,
                        background: t.isMono ? (t.isLight ? "#fafafa" : "#000") : t.bgSecondary,
                        position: "sticky", top: 53, height: "calc(100vh - 53px)",
                        overflowY: "auto",
                        padding: "16px 0",
                    }}>
                        {loading ? (
                            <p style={{ padding: "20px 16px", fontSize: "0.82rem", color: t.textMuted }}>Loading...</p>
                        ) : chapters.length === 0 ? (
                            <p style={{ padding: "20px 16px", fontSize: "0.82rem", color: t.textMuted, textAlign: "center" }}>
                                Manual coming soon
                            </p>
                        ) : (
                            chapters.map(ch => {
                                const isExp = expandedChapters.has(ch.id);
                                return (
                                    <div key={ch.id} style={{ marginBottom: 4 }}>
                                        <button onClick={() => toggleChapter(ch.id)} style={{
                                            display: "flex", alignItems: "center", gap: 8,
                                            width: "100%", padding: "9px 16px",
                                            background: "none", border: "none", cursor: "pointer",
                                            textAlign: "left",
                                        }}>
                                            {isExp
                                                ? <ChevronDown style={{ width: 13, height: 13, color: t.textMuted, flexShrink: 0 }} />
                                                : <ChevronRight style={{ width: 13, height: 13, color: t.textMuted, flexShrink: 0 }} />
                                            }
                                            <span style={{
                                                fontSize: "0.78rem", fontWeight: 800,
                                                color: t.textPrimary,
                                                textTransform: "uppercase",
                                                letterSpacing: "0.06em",
                                            }}>
                                                {ch.title}
                                            </span>
                                        </button>
                                        {isExp && ch.sections.length > 0 && (
                                            <div style={{ paddingLeft: 12 }}>
                                                {renderSectionTree(ch.sections, ch.slug)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </aside>

                    {/* Right — Reading Area */}
                    <main style={{
                        flex: 1,
                        padding: "40px 48px",
                        maxWidth: 900,
                        overflowY: "auto",
                    }}>
                        {children}
                    </main>
                </div>
            </div>
        </DocsContext.Provider>
    );
}
