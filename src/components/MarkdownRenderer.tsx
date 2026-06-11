"use client";

import { useMemo } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";

/**
 * MarkdownRenderer
 *
 * Converts markdown content to styled HTML. Supports:
 * - Headings (h1-h4) with anchor links
 * - Bold, italic, inline code
 * - Code blocks with syntax-highlighted background
 * - Custom callout blocks: > [!NOTE], > [!WARNING], > [!CAUTION]
 * - Images with border styling
 * - Links
 * - Unordered and ordered lists
 * - Horizontal rules
 *
 * Uses pure string replacement — no external markdown library.
 */
export default function MarkdownRenderer({ content }: { content: string }) {
    const t = useThemeTokens();

    const html = useMemo(() => {
        if (!content) return "";

        let text = content;

        // ── Escape HTML entities ──
        text = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // ── Code blocks (must be processed first before inline) ──
        text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
            const langLabel = lang ? `<span class="md-code-lang">${lang}</span>` : "";
            return `<div class="md-codeblock">${langLabel}<pre><code>${code.trim()}</code></pre></div>`;
        });

        // ── Callout blocks: > [!NOTE], > [!WARNING], > [!CAUTION] ──
        text = text.replace(
            /&gt; \[!(NOTE|WARNING|CAUTION|TIP|IMPORTANT)\]\n((?:&gt; .*(?:\n|$))*)/g,
            (_m, type, body) => {
                const clean = body.replace(/&gt; ?/g, "").trim();
                return `<div class="md-callout md-callout-${type.toLowerCase()}">\n<span class="md-callout-label">${type}</span>\n<span>${clean}</span>\n</div>`;
            }
        );

        // ── URL sanitization ──
        // Block javascript:/vbscript:/etc. URIs — only http(s)/mailto and
        // relative paths are allowed. Returns null for unsafe URLs.
        const safeUrl = (raw: string, allowDataImage = false): string | null => {
            // Strip control chars + spaces so "java\tscript:" can't slip past.
            const u = raw.replace(/[\u0000-\u0020]/g, "");
            const scheme = u.match(/^([a-z][a-z0-9+.\-]*):/i)?.[1]?.toLowerCase();
            if (scheme) {
                if (["http", "https", "mailto"].includes(scheme)) return u;
                if (allowDataImage && /^data:image\//i.test(u)) return u;
                return null;
            }
            return u; // relative path / anchor
        };

        // ── Images ──
        text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
            const safe = safeUrl(src, true);
            return safe ? `<img class="md-img" src="${safe}" alt="${alt}" />` : "";
        });

        // ── Links ──
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
            const safe = safeUrl(href);
            return safe
                ? `<a class="md-link" href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`
                : label;
        });

        // ── Headings ──
        text = text.replace(/^#### (.+)$/gm, (_m, h) => {
            const id = h.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            return `<h4 id="${id}" class="md-h4">${h}</h4>`;
        });
        text = text.replace(/^### (.+)$/gm, (_m, h) => {
            const id = h.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            return `<h3 id="${id}" class="md-h3">${h}</h3>`;
        });
        text = text.replace(/^## (.+)$/gm, (_m, h) => {
            const id = h.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            return `<h2 id="${id}" class="md-h2">${h}</h2>`;
        });
        text = text.replace(/^# (.+)$/gm, (_m, h) => {
            const id = h.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            return `<h1 id="${id}" class="md-h1">${h}</h1>`;
        });

        // ── Bold / Italic ──
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // ── Inline code ──
        text = text.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

        // ── Horizontal rules ──
        text = text.replace(/^---$/gm, '<hr class="md-hr" />');

        // ── Unordered lists ──
        text = text.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
        text = text.replace(/((?:<li class="md-li">.*<\/li>\n?)+)/g, '<ul class="md-ul">$1</ul>');

        // ── Ordered lists ──
        text = text.replace(/^\d+\. (.+)$/gm, '<li class="md-oli">$1</li>');
        text = text.replace(/((?:<li class="md-oli">.*<\/li>\n?)+)/g, '<ol class="md-ol">$1</ol>');

        // ── Paragraphs (remaining lines) ──
        text = text.replace(/^(?!<[a-z/])((?!$).+)$/gm, '<p class="md-p">$1</p>');

        return text;
    }, [content]);

    return (
        <>
            <div
                className="md-renderer"
                dangerouslySetInnerHTML={{ __html: html }}
            />
            <style>{`
                .md-renderer {
                    font-size: 1.02rem;
                    line-height: 1.85;
                    color: ${t.textSecondary};
                    word-break: break-word;
                }
                .md-h1 { font-size: 1.8rem; font-weight: 800; color: ${t.textPrimary}; margin: 32px 0 16px; letter-spacing: -0.02em; }
                .md-h2 { font-size: 1.4rem; font-weight: 700; color: ${t.textPrimary}; margin: 28px 0 12px; }
                .md-h3 { font-size: 1.15rem; font-weight: 700; color: ${t.textPrimary}; margin: 24px 0 10px; }
                .md-h4 { font-size: 1rem; font-weight: 700; color: ${t.textPrimary}; margin: 20px 0 8px; }
                .md-p { margin: 0 0 12px; }
                .md-link { color: ${t.accentPrimary}; text-decoration: none; font-weight: 600; }
                .md-link:hover { text-decoration: underline; }
                .md-inline-code {
                    background: ${t.bgTertiary};
                    border: 1px solid ${t.borderPrimary};
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-family: ${t.fontMono};
                    font-size: 0.88em;
                    color: ${t.accentPrimary};
                }
                .md-codeblock {
                    position: relative;
                    background: ${t.isMono ? (t.isLight ? "#f5f5f5" : "#0a0a0a") : "#0d1117"};
                    border: 1px solid ${t.borderPrimary};
                    border-radius: ${t.isMono ? 0 : 8}px;
                    margin: 16px 0;
                    overflow-x: auto;
                }
                .md-codeblock pre {
                    margin: 0;
                    padding: 16px 20px;
                    overflow-x: auto;
                }
                .md-codeblock code {
                    font-family: ${t.fontMono};
                    font-size: 0.86rem;
                    line-height: 1.6;
                    color: ${t.textPrimary};
                }
                .md-code-lang {
                    position: absolute;
                    top: 6px;
                    right: 10px;
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: ${t.textMuted};
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    font-family: ${t.fontMono};
                }
                .md-callout {
                    border-radius: ${t.isMono ? 0 : 8}px;
                    padding: 14px 18px;
                    margin: 16px 0;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    font-size: 0.92rem;
                }
                .md-callout-label {
                    font-size: 0.72rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                }
                .md-callout-note, .md-callout-tip {
                    background: ${t.accentPrimaryMuted};
                    border: 1px solid ${t.accentPrimary}33;
                    color: ${t.textSecondary};
                }
                .md-callout-note .md-callout-label, .md-callout-tip .md-callout-label { color: ${t.accentPrimary}; }
                .md-callout-warning, .md-callout-important {
                    background: ${t.statusWarningBg};
                    border: 1px solid ${t.statusWarning}33;
                    color: ${t.textSecondary};
                }
                .md-callout-warning .md-callout-label, .md-callout-important .md-callout-label { color: ${t.statusWarning}; }
                .md-callout-caution {
                    background: ${t.statusErrorBg};
                    border: 1px solid ${t.statusError}33;
                    color: ${t.textSecondary};
                }
                .md-callout-caution .md-callout-label { color: ${t.statusError}; }
                .md-img {
                    max-width: 100%;
                    border-radius: ${t.isMono ? 0 : 8}px;
                    border: 1px solid ${t.borderPrimary};
                    margin: 12px 0;
                }
                .md-ul, .md-ol { margin: 8px 0; padding-left: 24px; }
                .md-li, .md-oli { margin: 4px 0; }
                .md-hr {
                    border: none;
                    border-top: 1px solid ${t.borderPrimary};
                    margin: 24px 0;
                }
            `}</style>
        </>
    );
}
