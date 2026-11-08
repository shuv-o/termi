/** GET /api/auth/sso/callback — finish an OpenID Connect sign-in. */

import { NextResponse } from 'next/server';
import { getSession, createSession } from '@/lib/auth/session';
import { completeSignIn, findOrCreateSsoUser, OidcError, oidcConfig } from '@/lib/auth/oidc';
import { consumeOAuthStateCookie, oauthStateCookieDeletion } from '@/lib/auth/oauth-state';
import { sendEmailOTP } from '@/lib/auth/email-otp';
import { prisma } from '@/lib/db';
import { getClientIP } from '@/lib/api';

export async function GET(request: Request) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const fail = (code: string) => {
        const r = NextResponse.redirect(`${appUrl}/login?error=sso_${code}`);
        r.cookies.set(oauthStateCookieDeletion.name, '', oauthStateCookieDeletion.options);
        return r;
    };
    const cfg = oidcConfig();
    if (!cfg) return fail('not_configured');

    const { searchParams } = new URL(request.url);
    if (searchParams.get('error')) return fail('cancelled');
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const saved = await consumeOAuthStateCookie();
    if (!code || !state || !saved?.nonce || saved.state !== state) return fail('state');

    try {
        const identity = await completeSignIn(cfg, code, saved.codeVerifier, saved.nonce);
        const { userId, email } = await findOrCreateSsoUser(cfg, identity);
        const ipAddress = getClientIP(request);

        // As with Google: the provider proves who you are; Termi's own 2FA,
        // if you turned it on, still applies.
        const { twoFactorMethod } = (await prisma.user.findUnique({
            where: { id: userId },
            select: { twoFactorMethod: true },
        })) ?? { twoFactorMethod: 'NONE' };
        if (twoFactorMethod !== 'NONE') {
            const pending = await getSession();
            pending.isLoggedIn = false;
            pending.requires2FA = true;
            pending.tempUserId = userId;
            await pending.save();
            if (twoFactorMethod === 'EMAIL') await sendEmailOTP(userId, email, ipAddress);
            const r = NextResponse.redirect(
                `${appUrl}/login?twofa=${twoFactorMethod}&next=%2Fpanel`,
            );
            r.cookies.set(oauthStateCookieDeletion.name, '', oauthStateCookieDeletion.options);
            return r;
        }

        const sessionToken = await createSession(
            userId,
            email,
            request.headers.get('user-agent') || 'Unknown',
            ipAddress,
        );
        const session = await getSession();
        session.userId = userId;
        session.email = email;
        session.sessionToken = sessionToken;
        session.isLoggedIn = true;
        await session.save();
        const r = NextResponse.redirect(`${appUrl}/panel`);
        r.cookies.set(oauthStateCookieDeletion.name, '', oauthStateCookieDeletion.options);
        return r;
    } catch (err) {
        if (err instanceof OidcError) return fail(err.code);
        console.error('SSO callback error:', err);
        return fail('failed');
    }
}
