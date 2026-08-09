import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { hashPassword } from "@/lib/security";
import { audit } from "@/lib/audit";
import { generateMailboxPassword } from "@/lib/mail-accounts";

/**
 * POST /api/mail/mailbox/password — issue a new mailbox password.
 *
 * Only the bcrypt hash is stored, so an existing password can never be shown
 * again; this replaces it and returns the new one once. Webmail keeps working
 * either way (it authenticates as the Dovecot master user), so this only
 * affects external clients.
 */
export async function POST(req: Request) {
    const { userId, error } = await requireUser();
    if (error) return error;

    const mailbox = await prisma.mailMailbox.findUnique({
        where: { userId },
        select: { id: true, address: true, active: true },
    });
    if (!mailbox) {
        return NextResponse.json({ error: "You have no mailbox." }, { status: 404 });
    }

    const password = generateMailboxPassword();
    await prisma.mailMailbox.update({
        where: { id: mailbox.id },
        data: { passwordHash: await hashPassword(password) },
    });

    void audit({
        userId,
        action: "MAILBOX_PASSWORD_RESET",
        resourceType: "MailMailbox",
        resourceId: mailbox.id,
        metadata: { address: mailbox.address, selfService: true },
        req,
    });

    return NextResponse.json({ address: mailbox.address, password });
}
