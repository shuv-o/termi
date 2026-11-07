/**
 * GET /api/auth/google/callback
 * Handles the Google OAuth2 callback
 */

import { NextResponse } from 'next/server';
import { getSession, createSession } from '@/lib/auth/session';
import { exchangeGoogleCode, findOrCreateGoogleUser } from '@/lib/auth/google-oauth';
import { consumeOAuthStateCookie, oauthStateCookieDeletion } from '@/lib/auth/oauth-state';
import { sendEmailOTP } from '@/lib/auth/email-otp';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.redirect(`${appUrl}/login?error=oauth_cancelled`);
    }

    if (!code || !state) {
        return NextResponse.redirect(`${appUrl}/login?error=oauth_failed`);
    }

    // Read and decrypt the OAuth state cookie (SameSite=Lax — survives Google redirect)
    const oauthState = await consumeOAuthStateCookie();

    const deleteOAuthCookie = (response: NextResponse) => {
        response.cookies.set(oauthStateCookieDeletion.name, '', oauthStateCookieDeletion.options);
        return response;
    };

    if (!oauthState || oauthState.state !== state) {
        return deleteOAuthCookie(NextResponse.redirect(`${appUrl}/login?error=oauth_state`));
    }

    try {
        const googleUser = await exchangeGoogleCode(code, oauthState.codeVerifier);
        const { userId, email, isNewUser, hasMasterKey } = await findOrCreateGoogleUser(googleUser);

        const deviceInfo = request.headers.get('user-agent') || 'Unknown';
        const ipAddress =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            '0.0.0.0';

        const nextPath = isNewUser || !hasMasterKey ? '/setup-encryption' : '/unlock-encryption';

        // Google proves who owns the email, not the second factor. An account
        // with 2FA goes through the same pending-2FA step as a password login
        // (verify2FA completes it), instead of being logged in here.
        const { twoFactorMethod } = (await prisma.user.findUnique({
            where: { id: userId },
            select: { twoFactorMethod: true },
        })) ?? { twoFactorMethod: 'NONE' };
        if (twoFactorMethod !== 'NONE') {
            const pending = await getSession();
            pending.isLoggedIn = false;
            pending.requires2FA = true;
            pending.tempUserId = userId;
            pending.tempMasterKey = undefined;
            await pending.save();
            if (twoFactorMethod === 'EMAIL') await sendEmailOTP(userId, email, ipAddress);
            return deleteOAuthCookie(
                NextResponse.redirect(
                    `${appUrl}/login?twofa=${twoFactorMethod}&next=${encodeURIComponent(nextPath)}`,
                ),
            );
        }

        const sessionToken = await createSession(userId, email, deviceInfo, ipAddress);

        const session = await getSession();
        session.userId = userId;
        session.email = email;
        session.sessionToken = sessionToken;
        session.isLoggedIn = true;
        await session.save();

        return deleteOAuthCookie(NextResponse.redirect(`${appUrl}${nextPath}`));
    } catch (err) {
        console.error('Google OAuth callback error:', err);
        // Google returned an unverified email — refuse to link/register and tell
        // the user why, rather than showing a generic failure.
        if (err instanceof Error && err.message === 'ACCOUNT_UNVERIFIED') {
            return deleteOAuthCookie(
                NextResponse.redirect(`${appUrl}/login?error=oauth_account_unverified`),
            );
        }
        if (err instanceof Error && err.message === 'GOOGLE_EMAIL_UNVERIFIED') {
            return deleteOAuthCookie(
                NextResponse.redirect(`${appUrl}/login?error=oauth_email_unverified`),
            );
        }
        return deleteOAuthCookie(NextResponse.redirect(`${appUrl}/login?error=oauth_failed`));
    }
}
