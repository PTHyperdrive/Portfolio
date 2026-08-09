import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { hashPassword } from "@/lib/security";
import { audit } from "@/lib/audit";
import { generateMailboxPassword } from "@/lib/mail-accounts";
import { masterAuth, mailAdminConfigured, purgeMailbox } from "@/lib/mail-imap";

const patchSchema = z.object({
    active: z.boolean().optional(),
    quotaMb: z.number().int().min(64).max(102400).optional(),
    /** Issue a fresh password and return it once. */
    resetPassword: z.boolean().optional(),
});

/** PATCH — suspend/resume, change quota, or reset the password. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId: adminId, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const mailbox = await prisma.mailMailbox.findUnique({
        where: { id }, select: { id: true, address: true },
    });
    if (!mailbox) return NextResponse.json({ error: "No such mailbox" }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { active, quotaMb, resetPassword } = parsed.data;

    let newPassword: string | undefined;
    const data: Record<string, unknown> = {};
    if (active !== undefined) data.active = active;
    if (quotaMb !== undefined) data.quotaMb = quotaMb;
    if (resetPassword) {
        newPassword = generateMailboxPassword();
        data.passwordHash = await hashPassword(newPassword);
    }

    if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.mailMailbox.update({
        where: { id },
        data,
        select: { id: true, address: true, active: true, quotaMb: true },
    });

    void audit({
        userId: adminId!,
        action: resetPassword ? "MAILBOX_PASSWORD_RESET" : "MAILBOX_CREATE",
        resourceType: "MailMailbox",
        resourceId: id,
        metadata: { address: mailbox.address, active, quotaMb, resetPassword, byAdmin: true },
        req,
    });

    return NextResponse.json({ mailbox: updated, ...(newPassword ? { password: newPassword } : {}) });
}

/**
 * DELETE — remove a mailbox and its stored mail.
 * ?purge=false keeps the Maildir on disk (useful when handing an address to
 * a different owner); the default wipes it.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId: adminId, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const mailbox = await prisma.mailMailbox.findUnique({
        where: { id }, select: { id: true, address: true, userId: true },
    });
    if (!mailbox) return NextResponse.json({ error: "No such mailbox" }, { status: 404 });

    const purge = new URL(req.url).searchParams.get("purge") !== "false";
    if (purge && mailAdminConfigured()) {
        try { await purgeMailbox(masterAuth(mailbox.address), "INBOX"); }
        catch (err) { console.error("[admin/mail] purge failed:", err); }
    }

    await prisma.mailMailbox.delete({ where: { id } });

    void audit({
        userId: adminId!,
        action: "MAILBOX_DELETE",
        resourceType: "MailMailbox",
        resourceId: id,
        metadata: { address: mailbox.address, ownerUserId: mailbox.userId, purged: purge, byAdmin: true },
        req,
    });

    return NextResponse.json({ ok: true });
}
