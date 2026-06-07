/**
 * GET /api/auth/google/callback
 * Handles the Google OAuth2 callback
 */

import { NextResponse } from 'next/server';
import { getSession, createSession } from '@/lib/auth/session';
import { exchangeGoogleCode, findOrCreateGoogleUser } from '@/lib/auth/google-oauth';
import { consumeOAuthStateCookie, oauthStateCookieDeletion } from '@/lib/auth/oauth-state';

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
        response.cookies.set(
            oauthStateCookieDeletion.name,
            '',
            oauthStateCookieDeletion.options,
        );
        return response;
    };

    if (!oauthState || oauthState.state !== state) {
        return deleteOAuthCookie(
            NextResponse.redirect(`${appUrl}/login?error=oauth_state`),
        );
    }

    try {
        const googleUser = await exchangeGoogleCode(code, oauthState.codeVerifier);
        const { userId, email, isNewUser, hasMasterKey } = await findOrCreateGoogleUser(googleUser);

        const deviceInfo = request.headers.get('user-agent') || 'Unknown';
        const ipAddress =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            '0.0.0.0';

        const sessionToken = await createSession(userId, email, deviceInfo, ipAddress);

        const session = await getSession();
        session.userId = userId;
        session.email = email;
        session.sessionToken = sessionToken;
        session.isLoggedIn = true;
        await session.save();

        const redirectUrl = isNewUser || !hasMasterKey
            ? `${appUrl}/setup-encryption`
            : `${appUrl}/unlock-encryption`;

        return deleteOAuthCookie(NextResponse.redirect(redirectUrl));
    } catch (err) {
        console.error('Google OAuth callback error:', err);
        return deleteOAuthCookie(
            NextResponse.redirect(`${appUrl}/login?error=oauth_failed`),
        );
    }
}
