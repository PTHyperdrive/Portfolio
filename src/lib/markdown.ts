/**
 * Markdown -> HTML, as a pure function
 *
 * Lives outside the component so it can be tested directly. Every rule here is
 * a regex over the whole document, and source code is full of characters those
 * rules claim: a shell script's `# comment` became an <h1>, a YAML list's
 * `- item` became an <li>, `---` became an <hr>, and `int *ptr` was silently
 * italicised. So fenced and inline code are lifted out into placeholders first,
 * the markdown rules run over what remains, and the code goes back untouched at
 * the end.
 *
 * Unterminated fences matter just as much: while an answer is streaming the
 * closing fence has not arrived, and a regex needing both left the half-written
 * block as raw text for the rules above to mangle. The scanner closes an open
 * block at end of input and renders it as code immediately.
 */
export function renderMarkdown(content: string): string {
        if (!content) return "";

        const escape = (s: string) =>
            s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        /* ── 1. Lift fenced code out, line by line ──────────────── */
        const blocks: { lang: string; code: string; open: boolean }[] = [];
        const lines = content.split("\n");
        const kept: string[] = [];

        let fence: string | null = null;
        let lang = "";
        let buffer: string[] = [];

        for (const line of lines) {
            const opener = /^\s{0,3}(```+|~~~+)\s*([\w+#.-]*)\s*$/.exec(line);

            if (fence === null && opener) {
                fence = opener[1][0].repeat(3);
                lang = opener[2] || "";
                buffer = [];
                continue;
            }
            if (fence !== null) {
                // A closing fence is the same character, at least as long.
                if (/^\s{0,3}(```+|~~~+)\s*$/.test(line) && line.trim().startsWith(fence)) {
                    blocks.push({ lang, code: buffer.join("\n"), open: false });
                    kept.push(`<pre data-cb="${blocks.length - 1}"></pre>`);
                    fence = null;
                    continue;
                }
                buffer.push(line);
                continue;
            }
            kept.push(line);
        }
        // Still inside a block: the answer is mid-stream. Render what exists.
        if (fence !== null) {
            blocks.push({ lang, code: buffer.join("\n"), open: true });
            kept.push(`<pre data-cb="${blocks.length - 1}"></pre>`);
        }

        let text = escape(kept.join("\n"));
        // Placeholders were escaped along with everything else; bring them back.
        text = text.replace(/&lt;pre data-cb="(\d+)"&gt;&lt;\/pre&gt;/g, '<pre data-cb="$1"></pre>');

        /* ── 2. Lift inline code out too ────────────────────────── */
        // Private-use characters, so no later rule can match them.
        const inline: string[] = [];
        text = text.replace(/`([^`\n]+)`/g, (_m, code) => {
            inline.push(code);
            return `\uE000${inline.length - 1}\uE001`;
        });

        /* ── 3. Markdown rules, now safe to run ─────────────────── */

        // Callouts: > [!NOTE] and friends.
        text = text.replace(
            /&gt; \[!(NOTE|WARNING|CAUTION|TIP|IMPORTANT)\]\n((?:&gt; .*(?:\n|$))*)/g,
            (_m, type, body) => {
                const clean = body.replace(/&gt; ?/g, "").trim();
                return `<div class="md-callout md-callout-${type.toLowerCase()}">\n` +
                    `<span class="md-callout-label">${type}</span>\n<span>${clean}</span>\n</div>`;
            },
        );

        // Blockquotes — after callouts, which are a special case of them.
        text = text.replace(/(?:^&gt; ?.*(?:\n|$))+/gm, block => {
            const inner = block.replace(/^&gt; ?/gm, "").trim();
            return `<blockquote class="md-quote">${inner}</blockquote>\n`;
        });

        const safeUrl = (raw: string, allowDataImage = false): string | null => {
            // Strip control chars and spaces so "java\tscript:" cannot slip past.
            const u = raw.replace(/[\u0000-\u0020]/g, "");
            const scheme = u.match(/^([a-z][a-z0-9+.\-]*):/i)?.[1]?.toLowerCase();
            if (scheme) {
                if (["http", "https", "mailto"].includes(scheme)) return u;
                if (allowDataImage && /^data:image\//i.test(u)) return u;
                return null;
            }
            return u; // relative path or anchor
        };

        text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
            const safe = safeUrl(src, true);
            return safe ? `<img class="md-img" src="${safe}" alt="${alt}" />` : "";
        });

        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
            const safe = safeUrl(href);
            return safe
                ? `<a class="md-link" href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`
                : label;
        });

        // Tables. Recognised by the separator row, which is what distinguishes
        // a table from prose that happens to contain pipes.
        text = text.replace(
            /^\|(.+)\|[ \t]*\n\|[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|[ \t]*\n((?:\|.*\|[ \t]*(?:\n|$))*)/gm,
            (_m, header: string, body: string) => {
                const cells = (row: string) =>
                    row.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
                const head = cells(header).map(c => `<th class="md-th">${c}</th>`).join("");
                const rows = body.trimEnd().split("\n").filter(Boolean).map(row =>
                    `<tr>${cells(row).map(c => `<td class="md-td">${c}</td>`).join("")}</tr>`).join("");
                return `<div class="md-table-wrap"><table class="md-table">` +
                    `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
            },
        );

        const slug = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        text = text.replace(/^#### (.+)$/gm, (_m, h) => `<h4 id="${slug(h)}" class="md-h4">${h}</h4>`);
        text = text.replace(/^### (.+)$/gm, (_m, h) => `<h3 id="${slug(h)}" class="md-h3">${h}</h3>`);
        text = text.replace(/^## (.+)$/gm, (_m, h) => `<h2 id="${slug(h)}" class="md-h2">${h}</h2>`);
        text = text.replace(/^# (.+)$/gm, (_m, h) => `<h1 id="${slug(h)}" class="md-h1">${h}</h1>`);

        text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");
        // Italic requires a non-space after the marker, so "a * b" and a bullet
        // list's leading asterisk are not swallowed.
        text = text.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, "$1<em>$2</em>");

        text = text.replace(/^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/gm, '<hr class="md-hr" />');

        text = text.replace(/^\s*[-*+] (.+)$/gm, '<li class="md-li">$1</li>');
        text = text.replace(/((?:<li class="md-li">.*<\/li>\n?)+)/g, '<ul class="md-ul">$1</ul>');
        text = text.replace(/^\s*\d+\. (.+)$/gm, '<li class="md-oli">$1</li>');
        text = text.replace(/((?:<li class="md-oli">.*<\/li>\n?)+)/g, '<ol class="md-ol">$1</ol>');

        text = text.replace(/^(?!<[a-z/])((?!$).+)$/gm, '<p class="md-p">$1</p>');

        /* ── 4. Put the code back, exactly as written ───────────── */
        text = text.replace(/\uE000(\d+)\uE001/g, (_m, i) =>
            `<code class="md-inline-code">${escape(inline[Number(i)])}</code>`);

        text = text.replace(/<pre data-cb="(\d+)"><\/pre>/g, (_m, i) => {
            const block = blocks[Number(i)];
            if (!block) return "";
            const label = block.lang ? `<span class="md-code-lang">${escape(block.lang)}</span>` : "";
            // No copy button until the block is closed — copying half a
            // function while it is still arriving is worse than no button.
            const copy = block.open
                ? `<span class="md-code-streaming">writing…</span>`
                : `<button type="button" class="md-copy" data-label="Copy">Copy</button>`;
            return `<div class="md-codeblock">${label}${copy}` +
                `<pre><code>${escape(block.code)}</code></pre></div>`;
        });

        return text;
}
