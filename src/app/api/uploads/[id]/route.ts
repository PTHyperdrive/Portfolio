import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import { getStoredFilePath, deleteStoredFile, type UploadContext } from "@/lib/upload";

/**
 * GET /api/uploads/[id]
 *
 * Authenticated file download with hardened security headers.
 * Access control: file uploader or admin.
 *
 * Headers enforced:
 *   - X-Content-Type-Options: nosniff
 *   - Content-Disposition: attachment; filename="original_name"
 *   - Cache-Control: private, max-age=3600
 */

export const runtime = "nodejs";

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Look up file record
        const file = await prisma.fileUpload.findUnique({ where: { id } });
        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Access control: uploader or admin
        const isOwner = file.uploaderId === session.user.id;
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true },
        });
        const isAdmin = user?.role === "ADMIN";

        if (!isOwner && !isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Read file from isolated storage
        const filePath = getStoredFilePath(file.context as UploadContext, file.storedName);
        let buffer: Buffer;
        try {
            buffer = await readFile(filePath);
        } catch {
            return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
        }

        // Sanitize original filename for Content-Disposition
        const safeName = file.originalName
            .replace(/[^\w.\-]/g, "_")
            .substring(0, 200);

        return new Response(buffer as any, {
            headers: {
                "Content-Type": file.mimeType,
                "Content-Disposition": `attachment; filename="${safeName}"`,
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
                "Cache-Control": "private, max-age=3600",
                "Content-Length": buffer.length.toString(),
            },
        });
    } catch (err) {
        console.error("[GET /api/uploads/[id]]", err);
        return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
    }
}

/**
 * DELETE /api/uploads/[id]
 * Admin only — remove file from storage and database.
 */
export async function DELETE(_req: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true },
        });
        if (user?.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const file = await prisma.fileUpload.findUnique({ where: { id } });
        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Delete from filesystem
        await deleteStoredFile(file.context as UploadContext, file.storedName);

        // Delete from database
        await prisma.fileUpload.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[DELETE /api/uploads/[id]]", err);
        return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
    }
}
