/**
 * File ingest for the Studio — turning an upload into something a model can read
 *
 * Three outcomes, decided here rather than in the browser:
 *
 *   text    — decoded to UTF-8 and inlined into the turn as framed untrusted
 *             content. Works on every provider, local ones included.
 *   native  — handed to the provider as a document block (PDF today). Hosted
 *             models read the real layout, which beats any extraction we could
 *             do here. Local OpenAI-compatible runtimes have no equivalent, so
 *             a PDF sent to a local node is reported as unsupported rather than
 *             silently dropped or fed in as mojibake.
 *   reject  — anything else. A .docx stored as garbled XML is worse than an
 *             error message, because the model will confidently misread it.
 *
 * Nothing here trusts the client's Content-Type: the extension and the bytes
 * are both consulted, and a declared text file containing NUL bytes is treated
 * as binary. The uploaded text is never interpreted as instructions — the chat
 * route wraps it with frameUntrusted() before it reaches a model (control C6).
 */

/** Hard ceiling per file, before any context-budget trimming. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Most files per message. Matches the client-side picker limit. */
export const MAX_FILES = 10;

export interface IngestedFile {
    filename: string;
    mediaType: string;
    bytes: number;
    /** Extracted UTF-8 text, when the file is text-like. */
    text?: string;
    /** Raw base64, when the provider should read the original bytes. */
    data?: string;
}

export interface IngestError {
    filename: string;
    reason: string;
}

/**
 * Extensions we decode as text regardless of the declared MIME type.
 *
 * Browsers send application/octet-stream for most of these, and a few
 * (.ts, .md) get types that would fail a `text/*` check, so the extension is
 * the more reliable signal. The NUL-byte check below is what actually
 * guarantees the result is text.
 */
const TEXT_EXTENSIONS = new Set([
    "txt", "md", "markdown", "rst", "log", "csv", "tsv",
    "json", "jsonl", "ndjson", "yaml", "yml", "toml", "ini", "cfg", "conf", "env",
    "xml", "html", "htm", "css", "scss", "sass", "less",
    "js", "jsx", "mjs", "cjs", "ts", "tsx", "vue", "svelte",
    "py", "rb", "go", "rs", "java", "kt", "kts", "scala", "swift",
    "c", "h", "cpp", "hpp", "cc", "cs", "php", "pl", "lua", "r",
    "sh", "bash", "zsh", "fish", "ps1", "psm1", "bat", "cmd",
    "sql", "prisma", "graphql", "gql", "proto",
    "dockerfile", "gitignore", "editorconfig", "patch", "diff",
]);

/** Formats a hosted provider reads better than any parser we would write. */
const NATIVE_DOCUMENT_TYPES = new Set(["application/pdf"]);

/** Image types the vision path accepts. SVG is markup, not an image — excluded. */
export const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function extensionOf(filename: string): string {
    const base = filename.toLowerCase().split(/[\\/]/).pop() ?? "";
    // Extensionless conventional names (Dockerfile, Makefile) key on the name.
    if (!base.includes(".")) return base;
    return base.slice(base.lastIndexOf(".") + 1);
}

/** True when the bytes contain a NUL in the leading window — reliably binary. */
function looksBinary(bytes: Uint8Array): boolean {
    const window = Math.min(bytes.length, 8192);
    for (let i = 0; i < window; i++) if (bytes[i] === 0) return true;
    return false;
}

export type FileClass = "text" | "native" | "image" | "reject";

export function classify(filename: string, mediaType: string): FileClass {
    if (IMAGE_TYPES.has(mediaType)) return "image";
    if (NATIVE_DOCUMENT_TYPES.has(mediaType)) return "native";

    const ext = extensionOf(filename);
    if (ext === "pdf") return "native";
    if (TEXT_EXTENSIONS.has(ext)) return "text";
    if (mediaType.startsWith("text/")) return "text";
    if (/^application\/(json|xml|x-yaml|yaml|javascript|sql|toml)$/.test(mediaType)) return "text";

    return "reject";
}

/**
 * Convert one uploaded file into a model-readable form.
 *
 * Returns a string on failure rather than throwing: one bad file in a batch of
 * ten should be reported alongside the nine that worked, not fail the upload.
 */
export function ingestFile(
    filename: string,
    mediaType: string,
    bytes: Uint8Array,
): IngestedFile | string {
    if (bytes.length === 0) return "file is empty";
    if (bytes.length > MAX_FILE_BYTES) {
        return `file is ${(bytes.length / 1048576).toFixed(1)} MB — the limit is ${MAX_FILE_BYTES / 1048576} MB`;
    }

    switch (classify(filename, mediaType)) {
        case "image":
            return {
                filename,
                mediaType,
                bytes: bytes.length,
                data: Buffer.from(bytes).toString("base64"),
            };

        case "native":
            return {
                filename,
                mediaType: "application/pdf",
                bytes: bytes.length,
                data: Buffer.from(bytes).toString("base64"),
            };

        case "text": {
            if (looksBinary(bytes)) {
                return "looks like a binary file despite its extension";
            }
            // fatal:true rejects invalid UTF-8 rather than substituting U+FFFD,
            // which would hand the model corrupted text that reads as plausible.
            let text: string;
            try {
                text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
            } catch {
                return "is not valid UTF-8 text";
            }
            return { filename, mediaType: mediaType || "text/plain", bytes: bytes.length, text };
        }

        default:
            return (
                "is not a supported format. Upload text, source code, config, " +
                "CSV/JSON/Markdown, PDF, or an image."
            );
    }
}

/**
 * Render ingested text files as one block for the prompt, trimmed to a budget.
 *
 * Trimming is per file and proportional, so uploading one huge log alongside a
 * small config does not evict the config entirely. Truncation is stated inline —
 * a model that cannot see the end of a file needs to know that, or it will
 * answer as though it read the whole thing.
 */
export function renderFileBlock(files: IngestedFile[], charBudget: number): string {
    const textual = files.filter(f => typeof f.text === "string");
    if (textual.length === 0) return "";

    const perFile = Math.max(1000, Math.floor(charBudget / textual.length));

    return textual
        .map(f => {
            const body = f.text!;
            const shown = body.length > perFile ? body.slice(0, perFile) : body;
            const note =
                body.length > perFile
                    ? `\n\n[truncated — showing ${shown.length} of ${body.length} characters]`
                    : "";
            return `--- ${f.filename} (${f.mediaType}, ${f.bytes} bytes) ---\n${shown}${note}`;
        })
        .join("\n\n");
}

/** Short one-line summary persisted with the user turn, so a reload reads sanely. */
export function attachmentNote(files: IngestedFile[], imageCount: number): string {
    const parts: string[] = [];
    if (files.length) parts.push(files.map(f => f.filename).join(", "));
    if (imageCount) parts.push(`${imageCount} image(s)`);
    return parts.length ? `\n\n[attached ${parts.join(" + ")}]` : "";
}
