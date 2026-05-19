import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";
import { getStoredFilePath, type UploadContext } from "@/lib/upload";

/**
 * GET /api/tickets/file/[filename]
 *
 * Serves ticket evidence images inline for <img> tag rendering.
 *
 * Resolution order:
 *   1. New FileUpload registry → reads file from isolated storage
 *   2. Legacy fallback → reads from `data/uploads/tickets/`
 *
 * NOTE: Files are served directly instead of redirecting to /api/uploads/[id]
 * because browser ad-blockers flag URLs containing "/uploads/" and block them
 * with ERR_BLOCKED_BY_CLIENT.
 *
 * Security headers enforced:
 *   - X-Content-Type-Options: nosniff
 *   - Content-Disposition: inline (images) / attachment (others)
 *   - X-Frame-Options: DENY
 */

export const runtime = "nodejs";

const LEGACY_DIR = path.join(process.cwd(), "data", "uploads", "tickets");

const MIME_MAP: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp", gif: "image/gif",
};

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { filename } = await params;
        const safeName = path.basename(filename); // prevent traversal

        // Check user role
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true },
        });
        const isAdmin = user?.role === "ADMIN";

        // ── Try new FileUpload registry first ──
        const fileRecord = await prisma.fileUpload.findFirst({
            where: { storedName: safeName },
        });

        if (fileRecord) {
            // Access control: uploader or admin
            if (fileRecord.uploaderId !== session.user.id && !isAdmin) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }

            // Serve directly from isolated storage
            // (redirect to /api/uploads/[id] gets blocked by browser ad-blockers)
            const filePath = getStoredFilePath(
                fileRecord.context as UploadContext,
                fileRecord.storedName
            );
            let buffer: Buffer;
            try {
                buffer = await readFile(filePath);
            } catch {
                return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
            }

            const disposition = fileRecord.mimeType.startsWith("image/") ? "inline" : "attachment";
            const safOriginal = path.basename(fileRecord.originalName).replace(/[^\w.\-]/g, "_");

            return new Response(buffer as any, {
                headers: {
                    "Content-Type": fileRecord.mimeType,
                    "Content-Disposition": `${disposition}; filename="${safOriginal}"`,
                    "X-Content-Type-Options": "nosniff",
                    "X-Frame-Options": "DENY",
                    "Cache-Control": "private, max-age=3600",
                    "Content-Length": buffer.length.toString(),
                },
            });
        }

        // ── Legacy fallback: serve from filesystem ──
        // Filename format: userId_timestamp_random.ext
        const ownerUserId = safeName.split("_")[0];
        if (session.user.id !== ownerUserId && !isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const filePath = path.join(LEGACY_DIR, safeName);
        let buffer: Buffer;
        try {
            buffer = await readFile(filePath);
        } catch {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const ext = safeName.split(".").pop()?.toLowerCase();

        return new Response(buffer as any, {
            headers: {
                "Content-Type": MIME_MAP[ext || "png"] || "application/octet-stream",
                "Content-Disposition": `inline; filename="${safeName}"`,
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
                "Cache-Control": "private, max-age=3600",
                "Content-Length": buffer.length.toString(),
            },
        });
    } catch (err) {
        console.error("[GET /api/tickets/file/[filename]]", err);
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
}

