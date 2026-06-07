/**
 * GET /api/auth/google/authorize
 * Initiates Google OAuth2 PKCE flow
 */

import { NextResponse } from 'next/server';
import { createGoogleAuthURL } from '@/lib/auth/google-oauth';
import { setOAuthStateCookie } from '@/lib/auth/oauth-state';

export async function GET() {
    try {
        const { url, state, codeVerifier } = await createGoogleAuthURL();

        const response = NextResponse.redirect(url);
        await setOAuthStateCookie(response.cookies, state, codeVerifier);

        return response;
    } catch (error) {
        console.error('Google OAuth authorize error:', error);
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL || ''}/login?error=oauth_failed`,
        );
    }
}
