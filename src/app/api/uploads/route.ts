import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
    processUpload,
    isValidContext,
    getMaxFileCount,
    type UploadContext,
    type UploadError,
} from "@/lib/upload";

/**
 * POST /api/uploads
 *
 * Universal secure file upload endpoint.
 * Accepts multipart/form-data with:
 *   - `files`: one or more File objects
 *   - `context`: UploadContext string (TICKET, CHAT, AVATAR, MMO_ITEM, CMS_COVER)
 *
 * Security pipeline per file:
 *   1. Size enforcement (per-context limits)
 *   2. Magic byte validation (ignores client MIME)
 *   3. SHA-256 hashing (duplicate detection)
 *   4. EXIF stripping + re-encoding via Sharp
 *   5. Write to isolated non-public storage
 *   6. Register in FileUpload database table
 *
 * Duplicate files (same SHA-256) are rejected per-file with a warning.
 *
 * Returns: { files: [...successful], errors: [...failed] }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const files = formData.getAll("files") as File[];
        const context = (formData.get("context") as string)?.toUpperCase();

        // ── Validate context ──
        if (!context || !isValidContext(context)) {
            return NextResponse.json({
                error: "Invalid upload context. Must be one of: TICKET, CHAT, AVATAR, MMO_ITEM, CMS_COVER",
            }, { status: 400 });
        }

        // ── Validate file count ──
        if (!files.length) {
            return NextResponse.json({ error: "No files provided" }, { status: 400 });
        }

        const maxCount = getMaxFileCount(context as UploadContext);
        if (files.length > maxCount) {
            return NextResponse.json({
                error: `Maximum ${maxCount} file(s) allowed per upload for ${context}.`,
            }, { status: 400 });
        }

        // ── Process each file ──
        const successful: Array<{
            id: string;
            storedName: string;
            originalName: string;
            mimeType: string;
            sizeBytes: number;
        }> = [];
        const errors: UploadError[] = [];

        for (const file of files) {
            try {
                // Run through full security pipeline
                const result = await processUpload(
                    file,
                    context as UploadContext,
                    session.user.id
                );

                // ── Duplicate detection by SHA-256 ──
                const duplicate = await prisma.fileUpload.findFirst({
                    where: { sha256: result.sha256 },
                    select: { id: true, originalName: true },
                });

                if (duplicate) {
                    errors.push({
                        fileName: file.name || "unnamed",
                        error: `Duplicate file detected. This file has already been uploaded (matches "${duplicate.originalName}").`,
                    });
                    // Clean up the file that was just written
                    const { deleteStoredFile } = await import("@/lib/upload");
                    await deleteStoredFile(context as UploadContext, result.storedName);
                    continue;
                }

                // ── Register in database ──
                const record = await prisma.fileUpload.create({
                    data: {
                        context: context as UploadContext,
                        originalName: result.originalName,
                        storedName: result.storedName,
                        mimeType: result.mimeType,
                        sizeBytes: result.sizeBytes,
                        sha256: result.sha256,
                        uploaderId: session.user.id,
                    },
                });

                successful.push({
                    id: record.id,
                    storedName: record.storedName,
                    originalName: record.originalName,
                    mimeType: record.mimeType,
                    sizeBytes: record.sizeBytes,
                });
            } catch (err) {
                errors.push({
                    fileName: file.name || "unnamed",
                    error: (err as Error).message,
                });
            }
        }

        // ── Response ──
        const status = successful.length > 0 ? 200 : 400;
        return NextResponse.json({ files: successful, errors }, { status });
    } catch (err) {
        console.error("[POST /api/uploads]", err);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
