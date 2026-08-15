import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { ingestFile } from "@/lib/ai-files";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const fileSchema = z.object({
    filename: z.string().trim().min(1).max(200),
    mimeType: z.string().min(1).max(100).default("text/plain"),
    content: z.string().min(1).max(400_000),
});

const patchSchema = z.object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    instructions: z.string().trim().min(1).max(100_000).optional(),
    enabled: z.boolean().optional(),
    shared: z.boolean().optional(),
    /** Full replacement set. Absent leaves existing files untouched. */
    files: z.array(fileSchema).max(10).optional(),
});

/**
 * GET /api/ai/skills/[id] — one skill in full, including file bodies.
 *
 * Readable by the owner, or by anyone when it is shared: a user about to
 * attach a shared skill to their conversation is entitled to read what it
 * will tell the model to do.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const { id } = await params;
    const skill = await prisma.aiSkill.findFirst({
        where: { id, OR: [{ userId }, { shared: true }] },
        select: {
            id: true, name: true, description: true, instructions: true,
            shared: true, enabled: true, userId: true, updatedAt: true,
            files: { select: { id: true, filename: true, mimeType: true, content: true, bytes: true } },
        },
    });

    if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

    const { userId: ownerId, ...rest } = skill;
    return NextResponse.json({ skill: { ...rest, owned: ownerId === userId } });
}

/** PATCH — edit a skill. Owner only; sharing still requires admin. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const { id } = await params;
    const owned = await prisma.aiSkill.findFirst({ where: { id, userId }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
            { status: 400 },
        );
    }
    const { name, description, instructions, enabled, shared, files } = parsed.data;

    if (shared) {
        const role = (await prisma.user.findUnique({
            where: { id: userId }, select: { role: true },
        }))?.role ?? "USER";
        if (role !== "ADMIN") {
            return NextResponse.json(
                { error: "Only an administrator can share a skill with all users." },
                { status: 403 },
            );
        }
    }

    let validated: { filename: string; mimeType: string; content: string; bytes: number }[] | null = null;
    if (files) {
        validated = [];
        for (const f of files) {
            const bytes = Buffer.from(f.content, "utf8");
            const result = ingestFile(f.filename, f.mimeType, new Uint8Array(bytes));
            if (typeof result === "string" || typeof result.text !== "string") {
                return NextResponse.json(
                    { error: `"${f.filename}" ${typeof result === "string" ? result : "must be text"}.` },
                    { status: 400 },
                );
            }
            validated.push({
                filename: f.filename,
                mimeType: result.mediaType,
                content: result.text,
                bytes: bytes.length,
            });
        }
    }

    // Replace files inside the same transaction as the update, so a failure
    // cannot leave a skill whose instructions and references disagree.
    const update = prisma.aiSkill.update({
        where: { id },
        data: {
            ...(name !== undefined ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(instructions !== undefined ? { instructions } : {}),
            ...(enabled !== undefined ? { enabled } : {}),
            ...(shared !== undefined ? { shared } : {}),
            ...(validated ? { files: { create: validated } } : {}),
        },
        select: { id: true, name: true, description: true, shared: true, enabled: true, updatedAt: true },
    });

    const skill = validated
        ? (await prisma.$transaction([
            prisma.aiSkillFile.deleteMany({ where: { skillId: id } }),
            update,
        ]))[1]
        : await update;

    void audit({
        userId,
        action: "AI_SKILL_UPDATE",
        resourceType: "AiSkill",
        resourceId: id,
        metadata: { name: skill.name, shared: skill.shared, enabled: skill.enabled },
        req,
    });

    return NextResponse.json({ skill });
}

/** DELETE — owner only. Files and conversation attachments cascade. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const { id } = await params;
    const owned = await prisma.aiSkill.findFirst({ where: { id, userId }, select: { name: true } });
    if (!owned) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

    await prisma.aiSkill.delete({ where: { id } });

    void audit({
        userId,
        action: "AI_SKILL_DELETE",
        resourceType: "AiSkill",
        resourceId: id,
        metadata: { name: owned.name },
        req,
    });

    return NextResponse.json({ ok: true });
}
