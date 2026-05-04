import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";

/**
 * GET /api/tickets/file/[filename] — Serve ticket evidence image.
 * Only accessible by the file's uploader (extracted from filename) or admins.
 */

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads", "tickets");

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

        // Filename format: userId_timestamp_random.ext
        const ownerUserId = filename.split("_")[0];

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true },
        });

        // Access control: file owner or admin
        if (session.user.id !== ownerUserId && user?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Sanitize filename to prevent directory traversal
        const safeName = path.basename(filename);
        const filePath = path.join(UPLOAD_DIR, safeName);
        const buffer = await readFile(filePath);

        const ext = safeName.split(".").pop()?.toLowerCase();
        const mimeMap: Record<string, string> = {
            png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
            webp: "image/webp", gif: "image/gif",
        };

        return new Response(buffer, {
            headers: {
                "Content-Type": mimeMap[ext || "png"] || "application/octet-stream",
                "Cache-Control": "private, max-age=3600",
            },
        });
    } catch (err) {
        console.error("[GET /api/tickets/file/[filename]]", err);
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
}
