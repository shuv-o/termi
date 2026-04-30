/**
 * Google OAuth2 integration using Arctic library
 *
 * Required environment variables:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   NEXT_PUBLIC_APP_URL (for the callback URL)
 */

import { Google, generateCodeVerifier, generateState } from 'arctic';
import { OAuthProvider } from '@/app/generated/prisma/client';
import { prisma } from '@/lib/db';

function getGoogleClient(): Google {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectURI = `${appUrl}/api/auth/google/callback`;
    return new Google(clientId, clientSecret, redirectURI);
}

export interface GoogleAuthURL {
    url: string;
    state: string;
    codeVerifier: string;
}

/**
 * Generate the Google OAuth2 authorization URL with PKCE
 */
export async function createGoogleAuthURL(): Promise<GoogleAuthURL> {
    const google = getGoogleClient();
    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    // createAuthorizationURL is synchronous in arctic v3.x
    const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile']);

    return { url: url.toString(), state, codeVerifier };
}

export interface GoogleUserInfo {
    sub: string;
    email: string;
    emailVerified: boolean;
    name: string;
    picture?: string;
}

/**
 * Exchange authorization code for tokens and fetch user info
 */
export async function exchangeGoogleCode(
    code: string,
    codeVerifier: string
): Promise<GoogleUserInfo> {
    const google = getGoogleClient();
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);

    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Google user info: ${response.statusText}`);
    }

    const data = await response.json() as {
        sub: string;
        email: string;
        email_verified: boolean;
        name: string;
        picture?: string;
    };

    return {
        sub: data.sub,
        email: data.email,
        emailVerified: data.email_verified,
        name: data.name,
        picture: data.picture,
    };
}

export interface FindOrCreateGoogleUserResult {
    userId: string;
    email: string;
    isNewUser: boolean;
    hasMasterKey: boolean;
}

/**
 * Find or create a user from Google OAuth data.
 *
 * Cases:
 * A — New user: create User + OAuthAccount
 * B — Returning Google user: OAuthAccount exists, return user
 * C — Existing email/password user: link OAuthAccount to existing user
 */
export async function findOrCreateGoogleUser(
    googleInfo: GoogleUserInfo
): Promise<FindOrCreateGoogleUserResult> {
    const { sub, email } = googleInfo;

    // Case B: existing OAuthAccount
    const existingOAuth = await prisma.oAuthAccount.findUnique({
        where: {
            provider_providerAccountId: { provider: OAuthProvider.GOOGLE, providerAccountId: sub },
        },
        include: { user: { select: { id: true, email: true, masterKeyHash: true } } },
    });

    if (existingOAuth) {
        return {
            userId: existingOAuth.user.id,
            email: existingOAuth.user.email,
            isNewUser: false,
            hasMasterKey: !!existingOAuth.user.masterKeyHash,
        };
    }

    // Case C: existing user with same email
    const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true, masterKeyHash: true },
    });

    if (existingUser) {
        // Link Google account to existing user
        await prisma.$transaction([
            prisma.oAuthAccount.create({
                data: {
                    userId: existingUser.id,
                    provider: OAuthProvider.GOOGLE,
                    providerAccountId: sub,
                    email: email.toLowerCase(),
                },
            }),
            prisma.auditLog.create({
                data: {
                    userId: existingUser.id,
                    action: 'USER_OAUTH_LINKED',
                    details: { provider: 'GOOGLE' },
                },
            }),
        ]);

        return {
            userId: existingUser.id,
            email: existingUser.email,
            isNewUser: false,
            hasMasterKey: !!existingUser.masterKeyHash,
        };
    }

    // Case A: brand new user
    const newUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                email: email.toLowerCase(),
                passwordHash: null, // Google-only user
                isVerified: googleInfo.emailVerified,
                oauthAccounts: {
                    create: {
                        provider: OAuthProvider.GOOGLE,
                        providerAccountId: sub,
                        email: email.toLowerCase(),
                    },
                },
            },
            select: { id: true, email: true },
        });

        await tx.auditLog.create({
            data: {
                userId: user.id,
                action: 'USER_REGISTER',
                details: { authMethod: 'google' },
            },
        });

        return user;
    });

    return {
        userId: newUser.id,
        email: newUser.email,
        isNewUser: true,
        hasMasterKey: false,
    };
}
