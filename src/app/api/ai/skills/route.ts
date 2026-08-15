import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { availableSkills } from "@/lib/ai-skills";
import { ingestFile } from "@/lib/ai-files";
import { audit } from "@/lib/audit";

/**
 * /api/ai/skills — the user's own instruction sets
 *
 * A skill is instructions plus optional reference files, attached to a
 * conversation to change how the assistant works on it. See ai-skills.ts for
 * why skill text is composed into the system prompt as genuine instruction
 * while uploads in chat are framed as untrusted data.
 *
 * Reference files are stored as extracted text, not bytes. A skill is prompt
 * material, and prompt material has to be text — accepting a PDF here and
 * hoping the provider parses it would make the skill work on Claude and fail
 * silently on the local node.
 */

export const dynamic = "force-dynamic";

const fileSchema = z.object({
    filename: z.string().trim().min(1).max(200),
    mimeType: z.string().min(1).max(100).default("text/plain"),
    content: z.string().min(1).max(400_000),
});

const createSchema = z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).optional(),
    instructions: z.string().trim().min(1).max(100_000),
    /** Admin-only; a user publishing to everyone else is a privilege, not a flag. */
    shared: z.boolean().optional(),
    files: z.array(fileSchema).max(10).optional(),
});

/** GET — every skill this user may attach: their own, plus shared ones. */
export async function GET() {
    const { userId, error } = await requireUser();
    if (error) return error;

    const skills = await availableSkills(userId);

    return NextResponse.json({
        skills: skills.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            shared: s.shared,
            /** Whether this user can edit it, so the UI need not compare ids. */
            owned: s.userId === userId,
            fileCount: s._count.files,
            updatedAt: s.updatedAt,
        })),
    });
}

/** POST — create a skill owned by the caller. */
export async function POST(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
            { status: 400 },
        );
    }
    const { name, description, instructions, shared, files } = parsed.data;

    // Only an admin may publish a skill to every user. Read the role from the
    // database rather than the session so a demoted admin loses it at once.
    const role = (await prisma.user.findUnique({
        where: { id: userId }, select: { role: true },
    }))?.role ?? "USER";

    if (shared && role !== "ADMIN") {
        return NextResponse.json(
            { error: "Only an administrator can share a skill with all users." },
            { status: 403 },
        );
    }

    // Reference file text goes through the same validator as a chat upload, so
    // a skill cannot smuggle in content the chat path would have rejected.
    const validated: { filename: string; mimeType: string; content: string; bytes: number }[] = [];
    for (const f of files ?? []) {
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

    const existing = await prisma.aiSkill.findUnique({
        where: { userId_name: { userId, name } },
        select: { id: true },
    });
    if (existing) {
        return NextResponse.json(
            { error: `You already have a skill named "${name}".` },
            { status: 409 },
        );
    }

    const skill = await prisma.aiSkill.create({
        data: {
            userId,
            name,
            description: description || null,
            instructions,
            shared: Boolean(shared),
            ...(validated.length ? { files: { create: validated } } : {}),
        },
        select: { id: true, name: true, description: true, shared: true, updatedAt: true },
    });

    void audit({
        userId,
        action: "AI_SKILL_CREATE",
        resourceType: "AiSkill",
        resourceId: skill.id,
        metadata: { name, shared: Boolean(shared), files: validated.length },
        req,
    });

    return NextResponse.json({ skill }, { status: 201 });
}
