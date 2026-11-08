/** GET /api/auth/sso/authorize — start an OpenID Connect sign-in. */

import { NextResponse } from 'next/server';
import { createAuthorizationUrl, oidcConfig } from '@/lib/auth/oidc';
import { setOAuthStateCookie } from '@/lib/auth/oauth-state';

export async function GET() {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const cfg = oidcConfig();
    if (!cfg) return NextResponse.redirect(`${appUrl}/login?error=sso_not_configured`);
    try {
        const { url, state, nonce, codeVerifier } = await createAuthorizationUrl(cfg);
        const response = NextResponse.redirect(url);
        await setOAuthStateCookie(response.cookies, state, codeVerifier, nonce);
        return response;
    } catch (err) {
        console.error('SSO authorize error:', err);
        return NextResponse.redirect(`${appUrl}/login?error=sso_failed`);
    }
}
