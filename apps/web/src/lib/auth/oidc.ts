/**
 * Single sign-on through any OpenID Connect provider (Okta, Microsoft Entra
 * ID, Google Workspace, Keycloak, Authentik, …).
 *
 *   OIDC_ISSUER          https://login.example.com (discovery is used)
 *   OIDC_CLIENT_ID / OIDC_CLIENT_SECRET
 *   OIDC_NAME            button label, e.g. "Okta" (default "SSO")
 *   OIDC_SCOPES          default "openid email profile"
 *   OIDC_ALLOWED_DOMAINS only these email domains may sign in with SSO
 *   OIDC_ENFORCE_DOMAINS these email domains must use SSO: password, Google
 *                        and passkey sign-in (and registering) are refused
 *   OIDC_TRUST_EMAIL     "true" when the provider vouches for every email it
 *                        sends but omits email_verified (e.g. Entra ID)
 *
 * The flow is authorization code + PKCE, with state and a nonce; the ID
 * token's signature, issuer, audience, expiry and nonce are all checked.
 * Accounts link by verified email exactly like Google sign-in, and Termi's
 * own 2FA still applies on top of the provider's.
 */

import { createHash, randomBytes } from 'crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { OAuthProvider } from '@/app/generated/prisma/client';
import { prisma } from '@/lib/db';

export class OidcError extends Error {
    constructor(readonly code: string) {
        super(code);
    }
}

export interface OidcConfig {
    issuer: string;
    clientId: string;
    clientSecret: string;
    name: string;
    scopes: string;
    allowedDomains: string[];
    trustEmail: boolean;
}

const domains = (v: string | undefined) =>
    (v ?? '')
        .split(',')
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean);

export function oidcConfig(): OidcConfig | null {
    const issuer = process.env.OIDC_ISSUER?.replace(/\/+$/, '');
    const clientId = process.env.OIDC_CLIENT_ID;
    const clientSecret = process.env.OIDC_CLIENT_SECRET;
    if (!issuer || !clientId || !clientSecret) return null;
    return {
        issuer,
        clientId,
        clientSecret,
        name: process.env.OIDC_NAME || 'SSO',
        scopes: process.env.OIDC_SCOPES || 'openid email profile',
        allowedDomains: domains(process.env.OIDC_ALLOWED_DOMAINS),
        trustEmail: process.env.OIDC_TRUST_EMAIL === 'true',
    };
}

const domainOf = (email: string) => email.toLowerCase().split('@').pop() ?? '';

/** True when this email's domain must sign in with SSO only. */
export function ssoRequiredFor(email: string): boolean {
    const enforced = domains(process.env.OIDC_ENFORCE_DOMAINS);
    return enforced.length > 0 && oidcConfig() !== null && enforced.includes(domainOf(email));
}

export const SSO_REQUIRED_MESSAGE = 'Your organization requires signing in with single sign-on.';

// ── Discovery ──────────────────────────────────────────────────────────────

interface Discovery {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
}

let discoveryCache: {
    issuer: string;
    doc: Discovery;
    jwks: ReturnType<typeof createRemoteJWKSet>;
    at: number;
} | null = null;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

async function discover(cfg: OidcConfig) {
    if (
        discoveryCache &&
        discoveryCache.issuer === cfg.issuer &&
        Date.now() - discoveryCache.at < DISCOVERY_TTL_MS
    ) {
        return discoveryCache;
    }
    const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new OidcError('discovery_failed');
    const doc = (await res.json()) as Discovery;
    // The document must describe the issuer we were configured with.
    if (doc.issuer?.replace(/\/+$/, '') !== cfg.issuer) throw new OidcError('issuer_mismatch');
    for (const url of [doc.authorization_endpoint, doc.token_endpoint, doc.jwks_uri]) {
        if (!url || !/^https?:\/\//.test(url)) throw new OidcError('discovery_invalid');
    }
    discoveryCache = {
        issuer: cfg.issuer,
        doc,
        jwks: createRemoteJWKSet(new URL(doc.jwks_uri)),
        at: Date.now(),
    };
    return discoveryCache;
}

const callbackUrl = () =>
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:22080'}/api/auth/sso/callback`;

const b64url = (b: Buffer) => b.toString('base64url');

// ── Flow ───────────────────────────────────────────────────────────────────

export async function createAuthorizationUrl(cfg: OidcConfig) {
    const { doc } = await discover(cfg);
    const state = b64url(randomBytes(24));
    const nonce = b64url(randomBytes(24));
    const codeVerifier = b64url(randomBytes(32));
    const url = new URL(doc.authorization_endpoint);
    url.search = new URLSearchParams({
        response_type: 'code',
        client_id: cfg.clientId,
        redirect_uri: callbackUrl(),
        scope: cfg.scopes,
        state,
        nonce,
        code_challenge: b64url(createHash('sha256').update(codeVerifier).digest()),
        code_challenge_method: 'S256',
    }).toString();
    return { url: url.toString(), state, nonce, codeVerifier };
}

export interface OidcIdentity {
    sub: string;
    email: string;
    name?: string;
}

/** Exchange the code and validate the ID token; returns who signed in. */
export async function completeSignIn(
    cfg: OidcConfig,
    code: string,
    codeVerifier: string,
    nonce: string,
): Promise<OidcIdentity> {
    const { doc, jwks } = await discover(cfg);
    const res = await fetch(doc.token_endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString('base64')}`,
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: callbackUrl(),
            code_verifier: codeVerifier,
            client_id: cfg.clientId,
        }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new OidcError('token_exchange_failed');
    const tokens = (await res.json()) as { id_token?: string };
    if (!tokens.id_token) throw new OidcError('no_id_token');

    let claims: JWTPayload & {
        nonce?: string;
        email?: string;
        email_verified?: boolean | string;
        name?: string;
    };
    try {
        ({ payload: claims } = await jwtVerify(tokens.id_token, jwks, {
            issuer: doc.issuer,
            audience: cfg.clientId,
            clockTolerance: 60,
        }));
    } catch {
        throw new OidcError('id_token_invalid');
    }
    if (claims.nonce !== nonce) throw new OidcError('nonce_mismatch');
    if (!claims.sub) throw new OidcError('id_token_invalid');

    const email = claims.email?.toLowerCase();
    if (!email || !email.includes('@')) throw new OidcError('no_email');
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    if (!verified && !cfg.trustEmail) throw new OidcError('email_unverified');
    if (cfg.allowedDomains.length && !cfg.allowedDomains.includes(domainOf(email))) {
        throw new OidcError('domain_not_allowed');
    }
    return { sub: claims.sub, email, name: claims.name };
}

/**
 * The Termi account for an SSO identity: the linked one, an existing verified
 * account with the same email (linked now), or a new one.
 */
export async function findOrCreateSsoUser(cfg: OidcConfig, id: OidcIdentity) {
    const providerAccountId = `${cfg.issuer}|${id.sub}`;
    const linked = await prisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: OAuthProvider.OIDC, providerAccountId } },
        include: { user: { select: { id: true, email: true } } },
    });
    if (linked) return { userId: linked.user.id, email: linked.user.email };

    const existing = await prisma.user.findUnique({
        where: { email: id.email },
        select: { id: true, email: true, isVerified: true },
    });
    if (existing) {
        // Same rule as Google: never link to an account whose email was never
        // proven (whoever registered it could still sign in to it).
        if (!existing.isVerified) throw new OidcError('account_unverified');
        await prisma.$transaction([
            prisma.oAuthAccount.create({
                data: {
                    userId: existing.id,
                    provider: OAuthProvider.OIDC,
                    providerAccountId,
                    email: id.email,
                },
            }),
            prisma.auditLog.create({
                data: {
                    userId: existing.id,
                    action: 'USER_OAUTH_LINKED',
                    details: { provider: 'OIDC' },
                },
            }),
        ]);
        return { userId: existing.id, email: existing.email };
    }

    const user = await prisma.user.create({
        data: {
            email: id.email,
            name: id.name?.slice(0, 100) || null,
            passwordHash: null,
            isVerified: true,
            oauthAccounts: {
                create: { provider: OAuthProvider.OIDC, providerAccountId, email: id.email },
            },
        },
        select: { id: true, email: true },
    });
    await prisma.auditLog.create({
        data: { userId: user.id, action: 'USER_REGISTER', details: { authMethod: 'sso' } },
    });
    return { userId: user.id, email: user.email };
}
