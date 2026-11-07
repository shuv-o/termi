/**
 * Serving port-forward tunnels from their own origins.
 *
 * TUNNEL_ORIGIN_TEMPLATE (e.g. "https://{id}.termi-tunnels.net") gives every
 * tunnel its own origin: {id} is derived from the user, server, port and
 * target, so tunnels are isolated from Termi and from each other. Point a
 * wildcard DNS record (and a wildcard certificate) for that domain at this
 * app. Use a different registrable domain than Termi's own — a subdomain of
 * Termi's domain is "same-site", which would let a tunneled page send requests
 * that carry Termi's SameSite cookies.
 *
 * With it set, tunneled apps run unsandboxed on their own origin and can use
 * their own cookies, storage and logins. Without it, tunnels are served from
 * Termi's origin inside a CSP sandbox (see tunnel-sandbox.ts).
 */

import { createHmac } from 'crypto';

const ID_PLACEHOLDER = '{id}';
const ID_LENGTH = 16;

function template(): URL | null {
    const raw = process.env.TUNNEL_ORIGIN_TEMPLATE?.trim();
    if (!raw || !raw.includes(ID_PLACEHOLDER)) return null;
    try {
        return new URL(raw.replace(ID_PLACEHOLDER, 'x'.repeat(ID_LENGTH)));
    } catch {
        return null;
    }
}

export function tunnelOriginsEnabled(): boolean {
    return template() !== null;
}

/** Stable per-tunnel subdomain label. */
export function tunnelSubdomainId(grant: {
    userId: string;
    serverId: string;
    port: number;
    host: string;
}): string {
    const secret = process.env.SESSION_SECRET || '';
    return createHmac('sha256', secret)
        .update(`termi:tunnel-origin:${grant.userId}:${grant.serverId}:${grant.port}:${grant.host}`)
        .digest('hex')
        .slice(0, ID_LENGTH);
}

/** The origin ("https://<id>.example.net") a tunnel is served from. */
export function tunnelOrigin(id: string): string | null {
    const raw = process.env.TUNNEL_ORIGIN_TEMPLATE?.trim();
    if (!raw || !template()) return null;
    return new URL(raw.replace(ID_PLACEHOLDER, id)).origin;
}

/**
 * The tunnel id if `hostHeader` is one of the tunnel origins' hosts, else null.
 * Only the label in the {id} position may vary; the rest must match exactly.
 */
export function tunnelIdFromHost(hostHeader: string | null): string | null {
    const t = template();
    if (!t || !hostHeader) return null;
    const raw = process.env.TUNNEL_ORIGIN_TEMPLATE!.trim();
    const hostPattern = new URL(raw.replace(ID_PLACEHOLDER, 'idplaceholderxyz')).host;
    const [before, after] = hostPattern.split('idplaceholderxyz');
    const host = hostHeader.trim().toLowerCase();
    if (!host.startsWith(before) || !host.endsWith(after)) return null;
    const id = host.slice(before.length, host.length - after.length);
    return /^[0-9a-f]{16}$/.test(id) ? id : null;
}
