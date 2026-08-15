"use client";

import { useMemo, useRef, useCallback } from "react";
import { useThemeTokens } from "@/lib/useThemeTokens";
import { renderMarkdown } from "@/lib/markdown";

/**
 * MarkdownRenderer
 *
 * Converts markdown to styled HTML with pure string work — no parser
 * dependency. Supports headings, bold/italic/strikethrough, inline code,
 * fenced code blocks with a copy button, tables, blockquotes, callouts
 * (> [!NOTE] etc.), images, links, lists and rules.
 *
 * ── Why code is extracted before anything else ─────────────────────
 *
 * Every other rule here is a regex over the whole document, and source code is
 * full of characters those rules claim. A shell script's `# comment` became an
 * <h1>; a YAML list's `- item` became an <li>; `---` became an <hr>; and
 * `int *ptr` or `a * b` was silently turned into italics. So fenced and inline
 * code are lifted out into placeholders first, the markdown rules run over
 * what remains, and the code is put back untouched at the end.
 *
 * ── Unterminated fences ────────────────────────────────────────────
 *
 * In a chat the closing ``` has not arrived yet while the answer is streaming.
 * A regex requiring both fences leaves the half-written block as raw text,
 * which then gets mangled by the rules above — so every code answer looked
 * broken until the moment it finished. The scanner below closes an open block
 * at end of input instead, and renders it as code straight away.
 */
export default function MarkdownRenderer({ content }: { content: string }) {
    const t = useThemeTokens();
    const hostRef = useRef<HTMLDivElement>(null);

    /** Copy handled by delegation — the HTML is injected, so it has no React handlers. */
    const onClick = useCallback((e: React.MouseEvent) => {
        const button = (e.target as HTMLElement).closest<HTMLElement>(".md-copy");
        if (!button) return;
        const code = button.parentElement?.querySelector("code")?.textContent ?? "";
        void navigator.clipboard.writeText(code).then(() => {
            const previous = button.getAttribute("data-label") ?? "Copy";
            button.textContent = "Copied";
            setTimeout(() => { button.textContent = previous; }, 1500);
        });
    }, []);

    const html = useMemo(() => renderMarkdown(content), [content]);


    return (
        <>
            <div
                ref={hostRef}
                className="md-renderer"
                onClick={onClick}
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
                    word-break: break-all;
                }
                .md-codeblock {
                    position: relative;
                    background: ${t.isMono ? (t.isLight ? "#f5f5f5" : "#0a0a0a") : (t.isLight ? "#f6f8fa" : "#0d1117")};
                    border: 1px solid ${t.borderPrimary};
                    border-radius: ${t.cardRadius}px;
                    margin: 16px 0;
                }
                .md-codeblock pre {
                    margin: 0;
                    padding: 16px 20px;
                    overflow-x: auto;
                    /* Code must scroll inside its own box, never widen the page. */
                    max-width: 100%;
                }
                .md-codeblock code {
                    font-family: ${t.fontMono};
                    font-size: 0.86rem;
                    line-height: 1.6;
                    color: ${t.isLight ? t.textPrimary : "#e6edf3"};
                    white-space: pre;
                    tab-size: 4;
                }
                .md-code-lang {
                    position: absolute;
                    top: 7px;
                    left: 12px;
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: ${t.textMuted};
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    font-family: ${t.fontMono};
                    pointer-events: none;
                }
                .md-codeblock:has(.md-code-lang) pre { padding-top: 26px; }
                .md-copy, .md-code-streaming {
                    position: absolute;
                    top: 5px;
                    right: 8px;
                    font-size: 0.68rem;
                    font-weight: 600;
                    font-family: ${t.fontFamily};
                    padding: 3px 9px;
                    border-radius: ${t.buttonRadius}px;
                    border: 1px solid ${t.borderPrimary};
                    background: ${t.bgCard};
                    color: ${t.textMuted};
                }
                .md-copy { cursor: pointer; opacity: 0; transition: opacity 0.15s, color 0.15s; }
                .md-codeblock:hover .md-copy, .md-copy:focus-visible { opacity: 1; }
                .md-copy:hover { color: ${t.textPrimary}; }
                .md-code-streaming { border-style: dashed; opacity: 0.75; }
                .md-quote {
                    margin: 14px 0;
                    padding: 4px 0 4px 14px;
                    border-left: 3px solid ${t.borderPrimary};
                    color: ${t.textMuted};
                }
                .md-table-wrap { overflow-x: auto; margin: 16px 0; max-width: 100%; }
                .md-table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
                .md-th, .md-td {
                    border: 1px solid ${t.borderPrimary};
                    padding: 7px 12px;
                    text-align: left;
                    white-space: nowrap;
                }
                .md-th { background: ${t.bgTertiary}; color: ${t.textPrimary}; font-weight: 700; }
                .md-callout {
                    border-radius: ${t.cardRadius}px;
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
                    border-radius: ${t.cardRadius}px;
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
