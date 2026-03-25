import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import prisma from '@/lib/db';
import { verifyPassword } from '@/lib/security';
import { loginSchema } from '@/lib/validation';

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: PrismaAdapter(prisma),
    session: { strategy: 'jwt', maxAge: 24 * 60 * 60 }, // 24 hours
    pages: {
        signIn: '/auth/login',
        error: '/auth/error',
    },
    providers: [
        Credentials({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                const parsed = loginSchema.safeParse(credentials);
                if (!parsed.success) return null;

                const user = await prisma.user.findUnique({
                    where: { email: parsed.data.email },
                });

                if (!user || !user.passwordHash) return null;

                const isValid = await verifyPassword(
                    parsed.data.password,
                    user.passwordHash
                );

                if (!isValid) return null;

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.role = (user as Record<string, unknown>).role as string;
                token.id = user.id;
            }
            // Always refresh trial/plan data from DB on session refresh
            if (token.id) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: token.id as string },
                    select: { hasUsedTrial: true, trialExpiresAt: true, activePlan: true, planActivatedAt: true },
                });
                if (dbUser) {
                    token.hasUsedTrial = dbUser.hasUsedTrial;
                    token.trialExpiresAt = dbUser.trialExpiresAt?.toISOString() ?? null;
                    token.activePlan = dbUser.activePlan;
                    token.planActivatedAt = dbUser.planActivatedAt?.toISOString() ?? null;
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                const u = session.user as unknown as Record<string, unknown>;
                u.role = token.role as string;
                u.hasUsedTrial = token.hasUsedTrial as boolean;
                u.trialExpiresAt = token.trialExpiresAt as string | null;
                u.activePlan = token.activePlan as string | null;
                u.planActivatedAt = token.planActivatedAt as string | null;
            }
            return session;
        },
    },
});
