/**
 * Step-up re-authentication for sensitive actions.
 *
 * A valid session is not enough to reveal or export credentials: an unlocked
 * laptop should not be able to walk away with the whole inventory. Callers here
 * demand a fresh proof — password, 2FA code, or passkey — immediately before
 * the action.
 *
 * Extracted from the credential-reveal route so that every step-up path shares
 * one implementation; a divergence between two copies of this logic is exactly
 * the kind of bug that stays invisible until it is exploited.
 */

import { z } from 'zod';
import {
    verifyAuthenticationResponse,
    type AuthenticationResponseJSON,
    type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';

import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/crypto';
import { getSession } from '@/lib/auth/session';

export const passkeyResponseSchema = z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
        authenticatorData: z.string(),
        clientDataJSON: z.string(),
        signature: z.string(),
        userHandle: z.string().optional().nullable(),
    }),
    type: z.literal('public-key'),
    clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
    authenticatorAttachment: z.string().optional().nullable(),
});

/** Spread into a route's own schema to accept any of the three proofs. */
export const reauthFields = {
    authPassword: z.string().optional(),
    authCode: z.string().optional(), // TOTP or email OTP
    passkeyResponse: passkeyResponseSchema.optional(), // WebAuthn assertion
};

export interface ReauthInput {
    authPassword?: string;
    authCode?: string;
    passkeyResponse?: z.infer<typeof passkeyResponseSchema>;
}

/** True when the request carried at least one proof to check. */
export function hasReauthProof(input: ReauthInput): boolean {
    return Boolean(input.authPassword || input.authCode || input.passkeyResponse);
}

export function getRpDetails() {
    if (process.env.NODE_ENV === 'development') {
        return { rpID: 'localhost', origins: ['http://localhost:22080', 'http://127.0.0.1:22080'] };
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://termi.run';
    const url = new URL(appUrl);
    return { rpID: url.hostname, origins: [url.origin] };
}

/**
 * Verify a step-up proof for a user.
 *
 * Returns a plain boolean — the caller decides how to respond and is expected
 * to write an audit entry either way. Never throws for a failed proof; a thrown
 * error here means something unexpected went wrong, not that auth was refused.
 */
export async function verifyReauth(userId: string, input: ReauthInput): Promise<boolean> {
    const { authPassword, authCode, passkeyResponse } = input;

    if (authPassword) {
        const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { passwordHash: true },
        });
        if (!dbUser?.passwordHash) return false;
        return verifyPassword(dbUser.passwordHash, authPassword);
    }

    if (authCode) {
        const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { totpSecret: true, totpEnabled: true, twoFactorMethod: true },
        });
        if (!dbUser) return false;

        if (dbUser.twoFactorMethod === 'EMAIL') {
            const { verifyEmailOTP } = await import('@/lib/auth/email-otp');
            return verifyEmailOTP(userId, authCode);
        }

        if (dbUser.twoFactorMethod === 'TOTP' && dbUser.totpSecret) {
            const { decryptCredentialField } = await import('@/lib/crypto/credentials');
            const { verifyTOTP } = await import('@/lib/auth/totp');
            return verifyTOTP(decryptCredentialField(dbUser.totpSecret), authCode);
        }

        return false;
    }

    if (passkeyResponse) {
        return verifyPasskeyAssertion(userId, passkeyResponse as AuthenticationResponseJSON);
    }

    return false;
}

async function verifyPasskeyAssertion(
    userId: string,
    assertion: AuthenticationResponseJSON,
): Promise<boolean> {
    const session = await getSession();
    const challenge = session.passkeyChallenge;

    if (!challenge) return false;

    const passkey = await prisma.passkey.findUnique({
        where: { credentialID: assertion.id },
        select: {
            id: true,
            userId: true,
            credentialID: true,
            credentialPublicKey: true,
            counter: true,
            transports: true,
        },
    });

    if (!passkey || passkey.userId !== userId) return false;

    const { rpID, origins } = getRpDetails();

    try {
        const { verified, authenticationInfo } = await verifyAuthenticationResponse({
            response: assertion,
            expectedChallenge: challenge,
            expectedOrigin: origins,
            expectedRPID: rpID,
            credential: {
                id: passkey.credentialID,
                publicKey: new Uint8Array(passkey.credentialPublicKey),
                counter: Number(passkey.counter),
                transports: passkey.transports as AuthenticatorTransportFuture[],
            },
            requireUserVerification: false,
        });

        if (!verified) return false;

        // Burn the challenge before any further work, so a failure below cannot
        // leave it replayable.
        session.passkeyChallenge = undefined;
        await session.save();

        await prisma.passkey.update({
            where: { id: passkey.id },
            data: { counter: authenticationInfo.newCounter, lastUsedAt: new Date() },
        });

        return true;
    } catch (err) {
        console.error('Passkey re-authentication error:', err);
        return false;
    }
}
