/**
 * Termi Session Configuration (Edge-safe)
 *
 * These pieces contain no Node-only / Prisma dependencies, so they can be
 * imported from the Next.js proxy (`proxy.ts`), which runs on the Edge runtime,
 * as well as from the Node-side session helpers in `session.ts`.
 */

import { SessionOptions } from 'iron-session';

// TYPES

export interface SessionData {
    userId?: string;
    email?: string;
    sessionToken?: string;
    isLoggedIn: boolean;
    requires2FA?: boolean;
    tempUserId?: string; // For 2FA flow
    /** When this session last passed a step-up re-auth (keychain reveals reuse it for 5 min). */
    stepUpAt?: number;
    lastActivity?: number;
    passkeyChallenge?: string; // Base64URL challenge for WebAuthn registration/auth
    passkeyAuthUserId?: string; // userId resolved during passkey auth options (before assertion verified)
    // Temporary fields used during Google OAuth dance (cleared after callback)
    googleOAuthState?: string;
    googleCodeVerifier?: string;
}

// CONFIGURATION

export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days (web browser / PWA)
export const DESKTOP_SESSION_TTL = 60 * 60 * 24 * 30; // 30 days (Electron desktop, rolling)

/**
 * The Electron desktop app appends this token to its User-Agent (see
 * `apps/electron/main.js`). We use it to recognise desktop sessions — which get
 * a 30-day rolling lifetime — without any schema change, since the User-Agent
 * is already persisted as `Session.deviceInfo`.
 */
export const DESKTOP_UA_MARKER = 'TermiDesktop';

/** True when a User-Agent / deviceInfo string identifies the Electron desktop app. */
export function isDesktopDevice(deviceInfo?: string | null): boolean {
    return typeof deviceInfo === 'string' && deviceInfo.includes(DESKTOP_UA_MARKER);
}

function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET;
    // The .env.example placeholder is long enough to pass the length check.
    if (!secret || secret.length < 32 || /^change-me/i.test(secret)) {
        if (
            process.env.NODE_ENV === 'production' &&
            process.env.NEXT_PHASE !== 'phase-production-build'
        ) {
            throw new Error(
                'SESSION_SECRET must be set to a random value of at least 32 characters (not the example placeholder). ' +
                    'Generate one with: openssl rand -base64 32',
            );
        }
        // Dev fallback and build-time placeholder — never used in production at runtime
        return 'dev-only-fallback-secret-at-least-32-chars!!';
    }
    return secret;
}

export const sessionOptions: SessionOptions = {
    password: getSessionSecret(),
    cookieName: 'termi_session',
    cookieOptions: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        // Cookie lives long enough to cover the longest (desktop) window. The
        // authoritative expiry is the DB `Session.expiresAt` checked in
        // validateSession(), so web sessions still expire after SESSION_TTL even
        // though the cookie itself lingers.
        maxAge: DESKTOP_SESSION_TTL,
    },
};
