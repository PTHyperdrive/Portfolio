import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { hashPassword, checkRateLimit, sanitizeInput } from '@/lib/security';
import { registerSchema } from '@/lib/validation';
import { headers } from 'next/headers';

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

        const { name, email, password } = parsed.data;

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
