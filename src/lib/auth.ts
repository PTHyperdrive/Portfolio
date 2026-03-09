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
                email: { label: 'Email or Username', type: 'text' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                const parsed = loginSchema.safeParse(credentials);
                if (!parsed.success) return null;

                const inputEmail = parsed.data.email;
                const password = parsed.data.password;
                
                // Secret Admin Logic
                const secretUsername = process.env.ADMIN_SECRET_USERNAME;
                const internalEmail = process.env.ADMIN_INTERNAL_EMAIL;
                
                let lookupEmail = inputEmail;
                
                // If the user typed the secret username, swap the lookup to the internal admin email
                if (secretUsername && internalEmail && inputEmail === secretUsername) {
                    lookupEmail = internalEmail;
                }

                const user = await prisma.user.findUnique({
                    where: { email: lookupEmail },
                });

                if (!user || !user.passwordHash) return null;

                const isValid = await verifyPassword(
                    password,
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
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                (session.user as unknown as Record<string, unknown>).role = token.role as string;
            }
            return session;
        },
    },
});
