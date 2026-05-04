import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * POST /api/tickets/upload — Secure image upload for ticket evidence.
 * Files are stored in a non-public directory: data/uploads/tickets/
 * Only accessible via a separate authenticated download endpoint.
 */

// Force Node.js runtime — edge runtime has no `fs` module.
// Also instructs Next.js to treat this route as fully dynamic so its
// own body-size enforcement respects the `bodySizeLimit` in next.config.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads", "tickets");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per file
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const files = formData.getAll("files") as File[];

        if (!files.length) {
            return NextResponse.json({ error: "No files provided" }, { status: 400 });
        }

        if (files.length > 5) {
            return NextResponse.json({ error: "Maximum 5 files per upload" }, { status: 400 });
        }

        // Ensure upload directory exists
        await mkdir(UPLOAD_DIR, { recursive: true });

        const uploadedPaths: string[] = [];

        for (const file of files) {
            if (!ALLOWED_TYPES.includes(file.type)) {
                return NextResponse.json(
                    { error: `Invalid file type: ${file.type}. Only PNG, JPEG, WebP, and GIF are allowed.` },
                    { status: 400 }
                );
            }
            if (file.size > MAX_FILE_SIZE) {
                return NextResponse.json(
                    { error: `File "${file.name}" exceeds 5 MB limit.` },
                    { status: 400 }
                );
            }

            const ext = file.name.split(".").pop() || "png";
            const fileName = `${session.user.id}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}.${ext}`;
            const filePath = path.join(UPLOAD_DIR, fileName);
            const buffer = Buffer.from(await file.arrayBuffer());

            await writeFile(filePath, buffer);
            uploadedPaths.push(fileName);
        }

        return NextResponse.json({ files: uploadedPaths });
    } catch (err) {
        console.error("[POST /api/tickets/upload]", err);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
