import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { hashPassword, checkRateLimit, sanitizeInput } from '@/lib/security';
import { registerSchema } from '@/lib/validation';
import { headers } from 'next/headers';
import { audit } from '@/lib/audit';

export async function POST(request: Request) {
    try {
        // Rate limit registration
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        const rateLimit = checkRateLimit(`register:${ip}`, 3, 60 * 1000);

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Too many registration attempts. Please try again later.' },
                { status: 429 }
            );
        }

        const body = await request.json();
        const parsed = registerSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { name, email, password, invitationCode } = parsed.data;

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: 'An account with this email already exists.' },
                { status: 409 }
            );
        }

        // Validate invitation code if provided
        let invitationData: { id: string; creatorId: string; code: string } | null = null;
        if (invitationCode) {
            const normalised = invitationCode.toUpperCase().trim();
            const invitation = await prisma.invitationCode.findUnique({
                where: { code: normalised },
                select: { id: true, active: true, maxUses: true, usedCount: true, expiresAt: true, creatorId: true, code: true },
            });

            if (!invitation || !invitation.active) {
                return NextResponse.json({ error: 'Invalid invitation code.' }, { status: 400 });
            }
            if (invitation.expiresAt && new Date() > invitation.expiresAt) {
                return NextResponse.json({ error: 'Invitation code has expired.' }, { status: 400 });
            }
            if (invitation.usedCount >= invitation.maxUses) {
                return NextResponse.json({ error: 'Invitation code has reached maximum uses.' }, { status: 400 });
            }
            invitationData = { id: invitation.id, creatorId: invitation.creatorId, code: invitation.code };
        }

        // Create user with hashed password
        const passwordHash = await hashPassword(password);
        const user = await prisma.user.create({
            data: {
                name: sanitizeInput(name),
                email: email.toLowerCase(),
                passwordHash,
            },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
            },
        });

        // If invitation code was provided, consume it atomically
        if (invitationData) {
            await prisma.$transaction([
                prisma.invitationCode.update({
                    where: { id: invitationData.id },
                    data: { usedCount: { increment: 1 } },
                }),
                prisma.invitationRedemption.create({
                    data: {
                        invitationCodeId: invitationData.id,
                        userId: user.id,
                        context: "REGISTRATION",
                    },
                }),
            ]);

            // Audit invitation redemption
            void audit({
                userId: user.id,
                action: "INVITE_CODE_REDEEMED",
                resourceType: "InvitationCode",
                resourceId: invitationData.id,
                metadata: {
                    code: invitationData.code,
                    redeemedBy: user.id,
                    invitedBy: invitationData.creatorId,
                    context: "REGISTRATION",
                },
                req: request,
            });
        }

        // ISO 27001: Audit account creation (enriched with invitation data)
        void audit({
            userId: user.id,
            action: "ACCOUNT_CREATED",
            resourceType: "UserAccount",
            resourceId: user.id,
            metadata: {
                email: user.email,
                ...(invitationData ? {
                    invitationCode: invitationData.code,
                    invitedBy: invitationData.creatorId,
                } : {}),
            },
            req: request,
        });

        return NextResponse.json(
            { message: 'Account created successfully.', user },
            { status: 201 }
        );
    } catch (error) {
        console.error('Registration error:', error);
        return NextResponse.json(
            { error: 'Internal server error.' },
            { status: 500 }
        );
    }
}

