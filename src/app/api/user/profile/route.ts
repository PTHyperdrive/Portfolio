import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteStoredFile, type UploadContext } from "@/lib/upload";

// Avatar values must point at an upload owned by the caller: "/api/uploads/<id>"
const AVATAR_PATH_RE = /^\/api\/uploads\/([a-z0-9]+)$/i;

export async function PATCH(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, email, image } = body as {
            name?: string;
            email?: string;
            image?: string | null;
        };

        if (name === undefined && email === undefined && image === undefined) {
            return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        }

        // Check email uniqueness
        if (email) {
            const existing = await prisma.user.findFirst({
                where: { email, NOT: { id: session.user.id } },
            });
            if (existing) {
                return NextResponse.json({ error: "Email already in use by another account" }, { status: 409 });
            }
        }

        // Validate avatar: null clears it; a string must be an AVATAR upload
        // that belongs to this user (prevents pointing at other users' files).
        if (typeof image === "string") {
            const uploadId = AVATAR_PATH_RE.exec(image)?.[1];
            const upload = uploadId
                ? await prisma.fileUpload.findUnique({ where: { id: uploadId } })
                : null;
            if (!upload || upload.uploaderId !== session.user.id || upload.context !== "AVATAR") {
                return NextResponse.json({ error: "Invalid avatar image" }, { status: 400 });
            }
        }

        // Capture the previous avatar so its upload can be cleaned up below.
        const previous = image !== undefined
            ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { image: true } })
            : null;

        const updated = await prisma.user.update({
            where: { id: session.user.id },
            data: {
                ...(name !== undefined && { name }),
                ...(email !== undefined && { email }),
                ...(image !== undefined && { image }),
            },
            select: { id: true, name: true, email: true, image: true },
        });

        // Best-effort cleanup of the replaced avatar upload (file + record) so
        // storage doesn't accumulate orphans and the same file can be re-uploaded.
        if (image !== undefined && previous?.image && previous.image !== image) {
            const oldId = AVATAR_PATH_RE.exec(previous.image)?.[1];
            if (oldId) {
                try {
                    const old = await prisma.fileUpload.findUnique({ where: { id: oldId } });
                    if (old && old.uploaderId === session.user.id && old.context === "AVATAR") {
                        await deleteStoredFile(old.context as UploadContext, old.storedName);
                        await prisma.fileUpload.delete({ where: { id: oldId } });
                    }
                } catch (cleanupErr) {
                    console.error("Avatar cleanup failed (non-fatal):", cleanupErr);
                }
            }
        }

        return NextResponse.json({ user: updated });
    } catch (error) {
        console.error("Profile update error:", error);
        return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
}
