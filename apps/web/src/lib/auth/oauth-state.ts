/**
 * Short-lived, encrypted OAuth state cookie — separate from the main session.
 *
 * The main session uses SameSite=Strict. OAuth redirects from Google are
 * cross-site navigations, so Strict cookies are not sent on the callback.
 * We solve this by keeping the OAuth state/codeVerifier in their own
 * SameSite=Lax cookie that is encrypted, HttpOnly, and deleted after use.
 */

import { sealData, unsealData } from 'iron-session';
import { cookies } from 'next/headers';
import { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies';

const COOKIE_NAME = 'termi_oauth';
const TTL_SECONDS = 600; // 10 minutes

interface OAuthState {
    state: string;
    codeVerifier: string;
}

function getSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) return 'dev-only-fallback-secret-at-least-32-chars!!';
    return secret;
}

/** Encrypt and set the OAuth state cookie on a NextResponse. */
export async function setOAuthStateCookie(
    responseCookies: ResponseCookies,
    state: string,
    codeVerifier: string,
): Promise<void> {
    const sealed = await sealData({ state, codeVerifier } satisfies OAuthState, {
        password: getSecret(),
        ttl: TTL_SECONDS,
    });

    responseCookies.set(COOKIE_NAME, sealed, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: TTL_SECONDS,
        path: '/',
    });
}

/** Read, decrypt, and delete the OAuth state cookie. Returns null if missing or expired. */
export async function consumeOAuthStateCookie(): Promise<OAuthState | null> {
    const cookieStore = await cookies();
    const raw = cookieStore.get(COOKIE_NAME)?.value;
    if (!raw) return null;

    try {
        const data = await unsealData<OAuthState>(raw, { password: getSecret(), ttl: TTL_SECONDS });
        if (!data?.state || !data?.codeVerifier) return null;
        return data;
    } catch {
        return null;
    }
}

/** Cookie deletion options — call on the response after consuming. */
export const oauthStateCookieDeletion = {
    name: COOKIE_NAME,
    options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 0,
        path: '/',
    },
};
