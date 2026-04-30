/**
 * GET /api/auth/google/callback
 * Handles the Google OAuth2 callback
 */

import { NextResponse } from 'next/server';
import { getSession, createSession } from '@/lib/auth/session';
import { exchangeGoogleCode, findOrCreateGoogleUser } from '@/lib/auth/google-oauth';

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

    const session = await getSession();

    // Validate state nonce (CSRF protection)
    if (!session.googleOAuthState || session.googleOAuthState !== state) {
        session.googleOAuthState = undefined;
        session.googleCodeVerifier = undefined;
        await session.save();
        return NextResponse.redirect(`${appUrl}/login?error=oauth_state`);
    }

    const codeVerifier = session.googleCodeVerifier;
    if (!codeVerifier) {
        return NextResponse.redirect(`${appUrl}/login?error=oauth_failed`);
    }

    // Clear OAuth state immediately
    session.googleOAuthState = undefined;
    session.googleCodeVerifier = undefined;
    await session.save();

    try {
        const googleUser = await exchangeGoogleCode(code, codeVerifier);
        const { userId, email, isNewUser, hasMasterKey } = await findOrCreateGoogleUser(googleUser);

        const deviceInfo = request.headers.get('user-agent') || 'Unknown';
        const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || '0.0.0.0';

        const sessionToken = await createSession(userId, email, deviceInfo, ipAddress);

        session.userId = userId;
        session.email = email;
        session.sessionToken = sessionToken;
        session.isLoggedIn = true;
        // Note: masterKey is NOT set — Google users must unlock it separately
        await session.save();

        // Determine where to redirect
        if (isNewUser || !hasMasterKey) {
            return NextResponse.redirect(`${appUrl}/setup-encryption`);
        }
        return NextResponse.redirect(`${appUrl}/unlock-encryption`);
    } catch (err) {
        console.error('Google OAuth callback error:', err);
        return NextResponse.redirect(`${appUrl}/login?error=oauth_failed`);
    }
}
