/**
 * GET /api/auth/google/authorize
 * Initiates Google OAuth2 PKCE flow
 */

import { NextResponse } from 'next/server';
import { createGoogleAuthURL } from '@/lib/auth/google-oauth';
import { getSession } from '@/lib/auth/session';

export async function GET() {
    try {
        const { url, state, codeVerifier } = await createGoogleAuthURL();

        // Store state + codeVerifier in session for validation in callback
        const session = await getSession();
        session.googleOAuthState = state;
        session.googleCodeVerifier = codeVerifier;
        await session.save();

        return NextResponse.redirect(url);
    } catch (error) {
        console.error('Google OAuth authorize error:', error);
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL || ''}/login?error=oauth_failed`
        );
    }
}
