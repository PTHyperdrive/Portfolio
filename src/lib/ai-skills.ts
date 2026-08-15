/**
 * Skills — user-authored instruction sets attached to a conversation
 *
 * A skill is a named block of instructions plus optional reference files, both
 * composed into the system prompt when the user enables it on a thread. It is
 * the same idea as a Claude Skill: "here is how I want this kind of work done",
 * stated once and reused, instead of re-pasted into every message.
 *
 * ── Why skills are trusted and uploads are not ─────────────────────
 *
 * Skill text is authored by the signed-in user for their own conversations, so
 * it goes into the system prompt as genuine instruction. That is the whole
 * point — a skill that had to be framed as untrusted data could not change
 * behaviour, which is what a skill is for.
 *
 * The boundaries that still hold:
 *
 *   - A skill can never widen what a model may *see*. Retrieval visibility is
 *     decided by role in ai-knowledge, from the database, after skills compose.
 *   - A skill can never change which node runs. The tier gate reads the user's
 *     role from the database, not from any prompt text.
 *   - Shared skills are admin-published only. A user cannot make their own text
 *     land in someone else's system prompt (see the POST route's `shared` gate).
 *
 * So the worst a hostile skill does is misinstruct its own author's chats,
 * which is a thing they could do by typing anyway.
 */

import { prisma } from "@/lib/db";

/** Total characters of skill text admitted to one prompt. */
const SKILL_CHAR_BUDGET = 24_000;

export interface ComposedSkill {
    id: string;
    name: string;
    /** Rendered block: instructions plus any reference files. */
    block: string;
}

/**
 * Skills a user may attach: their own, plus anything an admin has shared.
 * Disabled skills are excluded here rather than at render time, so a skill
 * switched off stops affecting threads that already have it attached.
 */
export async function availableSkills(userId: string) {
    return prisma.aiSkill.findMany({
        where: {
            enabled: true,
            OR: [{ userId }, { shared: true }],
        },
        select: {
            id: true, name: true, description: true, shared: true,
            userId: true, updatedAt: true,
            _count: { select: { files: true } },
        },
        orderBy: [{ shared: "asc" }, { name: "asc" }],
    });
}

/**
 * Load and render the skills attached to a conversation.
 *
 * Ownership is re-checked in the query rather than trusted from the join row:
 * a skill un-shared after being attached must stop applying immediately, not
 * at the next time someone edits the thread.
 */
export async function composeSkills(
    conversationId: string,
    userId: string,
): Promise<ComposedSkill[]> {
    const rows = await prisma.aiConversationSkill.findMany({
        where: {
            conversationId,
            skill: { enabled: true, OR: [{ userId }, { shared: true }] },
        },
        select: {
            skill: {
                select: {
                    id: true, name: true, description: true, instructions: true,
                    files: { select: { filename: true, content: true, mimeType: true } },
                },
            },
        },
    });

    const out: ComposedSkill[] = [];
    let used = 0;

    for (const { skill } of rows) {
        const parts = [`## Skill: ${skill.name}`];
        if (skill.description) parts.push(`_${skill.description}_`);
        parts.push(skill.instructions.trim());

        for (const file of skill.files) {
            // Reference files are part of the skill its author wrote, so they
            // are instruction material — but they are still shown with clear
            // delimiters so the model can tell where each one ends.
            parts.push(
                `### Reference: ${file.filename} (${file.mimeType})\n` +
                "```\n" + file.content.trim() + "\n```",
            );
        }

        const block = parts.join("\n\n");

        // Stop rather than truncate mid-skill: half an instruction set is worse
        // than none, because the model cannot tell it is missing the rest.
        if (used + block.length > SKILL_CHAR_BUDGET && out.length > 0) break;

        used += block.length;
        out.push({ id: skill.id, name: skill.name, block });
    }

    return out;
}

/** Render composed skills as the section appended to the system prompt. */
export function renderSkills(skills: ComposedSkill[]): string {
    if (skills.length === 0) return "";
    return [
        "# Active skills",
        "",
        "The user has attached the following instruction sets to this conversation. " +
        "Follow them as part of your instructions. Where two skills conflict, the " +
        "user's message in this turn wins; if it is silent, say which skills " +
        "disagree rather than picking one arbitrarily.",
        "",
        ...skills.map(s => s.block),
    ].join("\n");
}
