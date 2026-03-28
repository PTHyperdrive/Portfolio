import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import prisma from '@/lib/db';
import { verifyPassword } from '@/lib/security';
import { loginSchema } from '@/lib/validation';

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: PrismaAdapter(prisma),
    trustHost: true,
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
        async signIn({ user, account, profile, email, credentials }) {
            void account; void profile; void email; void credentials;

            if (!user?.id) return true;

            try {
                console.log("[AUTH] signIn callback fired for user:", user.id);
                const dbSession = await prisma.deviceSession.create({
                    data: { userId: user.id },
                });
                console.log("[AUTH] DeviceSession created:", dbSession.id);
                // Store the session ID in a way the jwt callback can access it.
                // We attach it to the user object so NextAuth passes it into the
                // first jwt() call (where `user` is defined).
                (user as Record<string, unknown>).sessionId = dbSession.id;
            } catch (error) {
                console.error("[AUTH ERROR] Failed to create DeviceSession:", error);
            }

            return true;
        },
        async jwt({ token, user }) {
            // ── First sign-in: capture sessionId from the user object ────
            if (user) {
                token.role = (user as Record<string, unknown>).role as string;
                token.id = user.id;
                const sid = (user as Record<string, unknown>).sessionId;
                if (sid) token.sessionId = sid as string;
            }

            // ── Subsequent requests: verify the DeviceSession still exists ─
            if (token.sessionId) {
                try {
                    const activeSession = await prisma.deviceSession.findUnique({
                        where: { id: token.sessionId as string },
                        select: { id: true },
                    });
                    if (!activeSession) {
                        console.log("[AUTH] Session revoked:", token.sessionId);
                        token.error = "SessionRevoked";
                    } else {
                        // Clear any previous error if session is restored
                        delete token.error;
                    }
                } catch (err) {
                    console.error("[AUTH] Session check error:", err);
                    // Don't poison the token on DB errors — fail open
                }
            }

            // ── Always refresh trial/plan data ───────────────────────────
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
                // Propagate the revocation error so clients can react
                if (token.error) {
                    u.error = token.error as string;
                }
            }
            return session;
        },
    },
});
