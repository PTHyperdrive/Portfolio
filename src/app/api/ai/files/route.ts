import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { ingestFile, MAX_FILES, MAX_FILE_BYTES } from "@/lib/ai-files";
import type { IngestedFile, IngestError } from "@/lib/ai-files";

/**
 * POST /api/ai/files — multipart upload, converted to model-readable form
 *
 * The browser posts the raw files; this route decodes them and hands back
 * either extracted text or base64 for native document formats. Nothing is
 * stored: the client keeps the result and posts it with the next chat message,
 * so an upload that is never sent leaves nothing behind.
 *
 * Partial success is the normal case. Ten files where two are unreadable
 * returns eight results and two errors, not a 400 — the user should see which
 * files failed, not lose the batch.
 *
 * Extraction happens server-side rather than in the browser on purpose: it is
 * the same code path the MCP file tools use, so a file reads identically
 * whether it arrived through the chat box or through a tool call.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
    const { error } = await requireUser();
    if (error) return error;

    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });
    }

    const uploads = form.getAll("files").filter((v): v is File => v instanceof File);
    if (uploads.length === 0) {
        return NextResponse.json({ error: "No files were attached." }, { status: 400 });
    }
    if (uploads.length > MAX_FILES) {
        return NextResponse.json(
            { error: `Too many files — ${MAX_FILES} at a time.` },
            { status: 400 },
        );
    }

    const files: IngestedFile[] = [];
    const errors: IngestError[] = [];

    for (const upload of uploads) {
        // Check the declared size before reading the body into memory; a 2 GB
        // upload should be refused, not buffered and then refused.
        if (upload.size > MAX_FILE_BYTES) {
            errors.push({
                filename: upload.name,
                reason: `is ${(upload.size / 1048576).toFixed(1)} MB — the limit is ${MAX_FILE_BYTES / 1048576} MB`,
            });
            continue;
        }

        const bytes = new Uint8Array(await upload.arrayBuffer());
        const result = ingestFile(upload.name, upload.type, bytes);

        if (typeof result === "string") {
            errors.push({ filename: upload.name, reason: result });
        } else {
            files.push(result);
        }
    }

    return NextResponse.json({ files, errors });
}
