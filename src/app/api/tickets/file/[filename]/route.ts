import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";

/**
 * GET /api/tickets/file/[filename]
 *
 * Backward-compatible file serve route for ticket evidence images.
 * Serves files from the legacy `data/uploads/tickets/` directory
 * AND checks the new FileUpload registry.
 *
 * Security headers enforced:
 *   - X-Content-Type-Options: nosniff
 *   - Content-Disposition: attachment
 *   - X-Frame-Options: DENY
 */

export const runtime = "nodejs";

const LEGACY_DIR = path.join(process.cwd(), "data", "uploads", "tickets");

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
            // Redirect to new endpoint
            return NextResponse.redirect(
                new URL(`/api/uploads/${fileRecord.id}`, _req.url),
                307
            );
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
        const mimeMap: Record<string, string> = {
            png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
            webp: "image/webp", gif: "image/gif",
        };

        return new Response(buffer as any, {
            headers: {
                "Content-Type": mimeMap[ext || "png"] || "application/octet-stream",
                "Content-Disposition": `attachment; filename="${safeName}"`,
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
                "Cache-Control": "private, max-age=3600",
            },
        });
    } catch (err) {
        console.error("[GET /api/tickets/file/[filename]]", err);
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
}
