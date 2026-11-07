/**
 * Capability tokens for the /tunnel HTTP proxy.
 *
 * Tunneled pages are sandboxed (CSP `sandbox` without `allow-same-origin`), so
 * the browser treats their requests as cross-site and never attaches Termi's
 * SameSite=strict session cookie — which is the point: a tunneled app must not
 * be able to act as the user. The proxy therefore authenticates those requests
 * with a token embedded in the URL path instead, minted once from a normal
 * session-authenticated visit.
 *
 * A token grants exactly one thing: proxying to one host:port through one
 * server, for one user, for a few hours. Access to the server is re-checked on
 * every request, so revoking a share still takes effect immediately.
 */

import { createHmac, timingSafeEqual } from 'crypto';

export const TUNNEL_TOKEN_PREFIX = '_tt_';
const TTL_MS = 8 * 60 * 60 * 1000;

export interface TunnelGrant {
    userId: string;
    serverId: string;
    port: number;
    host: string;
}

interface TokenPayload {
    u: string;
    s: string;
    p: number;
    h: string;
    e: number;
}

function key(): Buffer {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) throw new Error('SESSION_SECRET is not configured');
    // Domain-separated from the session cookie's own use of the secret.
    return createHmac('sha256', secret).update('termi:tunnel-token:v1').digest();
}

const sign = (data: string) => createHmac('sha256', key()).update(data).digest('base64url');

export function mintTunnelToken(grant: TunnelGrant, now = Date.now()): string {
    const payload: TokenPayload = {
        u: grant.userId,
        s: grant.serverId,
        p: grant.port,
        h: grant.host,
        e: now + TTL_MS,
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${data}.${sign(data)}`;
}

/** The grant a token carries, or null if it is forged, expired or malformed. */
export function readTunnelToken(token: string, now = Date.now()): TunnelGrant | null {
    const [data, sig, extra] = token.split('.');
    if (!data || !sig || extra !== undefined) return null;
    const expected = Buffer.from(sign(data));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
        const p = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as TokenPayload;
        if (
            typeof p.u !== 'string' ||
            typeof p.s !== 'string' ||
            typeof p.h !== 'string' ||
            !Number.isInteger(p.p) ||
            typeof p.e !== 'number' ||
            p.e <= now
        ) {
            return null;
        }
        return { userId: p.u, serverId: p.s, port: p.p, host: p.h };
    } catch {
        return null;
    }
}
