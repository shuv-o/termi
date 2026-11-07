/**
 * SSRF (Server-Side Request Forgery) Protection
 *
 * Validates that a host/IP supplied by a user does not point to private,
 * loopback, link-local, or metadata service addresses — unless the deployment
 * explicitly allows internal networks (e.g., home-lab use).
 */

import { isIP } from 'net';
import dns from 'dns/promises';

// Private / reserved CIDR ranges (IPv4)
const BLOCKED_V4_RANGES = [
    { start: ip4ToInt('0.0.0.0'), end: ip4ToInt('0.255.255.255') }, // 0.0.0.0/8
    { start: ip4ToInt('10.0.0.0'), end: ip4ToInt('10.255.255.255') }, // 10.0.0.0/8
    { start: ip4ToInt('100.64.0.0'), end: ip4ToInt('100.127.255.255') }, // 100.64.0.0/10 (CGNAT)
    { start: ip4ToInt('127.0.0.0'), end: ip4ToInt('127.255.255.255') }, // 127.0.0.0/8 (loopback)
    { start: ip4ToInt('169.254.0.0'), end: ip4ToInt('169.254.255.255') }, // 169.254.0.0/16 (link-local / AWS metadata)
    { start: ip4ToInt('172.16.0.0'), end: ip4ToInt('172.31.255.255') }, // 172.16.0.0/12
    { start: ip4ToInt('192.0.0.0'), end: ip4ToInt('192.0.0.255') }, // 192.0.0.0/24
    { start: ip4ToInt('192.168.0.0'), end: ip4ToInt('192.168.255.255') }, // 192.168.0.0/16
    { start: ip4ToInt('198.18.0.0'), end: ip4ToInt('198.19.255.255') }, // 198.18.0.0/15
    { start: ip4ToInt('198.51.100.0'), end: ip4ToInt('198.51.100.255') }, // TEST-NET-2
    { start: ip4ToInt('203.0.113.0'), end: ip4ToInt('203.0.113.255') }, // TEST-NET-3
    { start: ip4ToInt('224.0.0.0'), end: ip4ToInt('255.255.255.255') }, // multicast + reserved
];

function ip4ToInt(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
    const int = ip4ToInt(ip);
    return BLOCKED_V4_RANGES.some((r) => int >= r.start && int <= r.end);
}

function isBlockedIPv6(ip: string): boolean {
    const lower = ip.toLowerCase().replace(/^\[|]$/g, '');
    return (
        lower === '::1' ||
        lower.startsWith('fc') ||
        lower.startsWith('fd') ||
        lower.startsWith('fe80') ||
        lower === '::' ||
        lower.startsWith('::ffff:') // IPv4-mapped
    );
}

/**
 * Cloud metadata endpoints and the link-local range they live in. These are
 * refused even with ALLOW_PRIVATE_NETWORKS=true: a home lab never needs them,
 * and they are how an SSRF turns into stolen cloud credentials.
 */
const METADATA_HOSTNAMES = new Set([
    'metadata',
    'metadata.google.internal',
    'metadata.goog',
    'instance-data',
    'instance-data.ec2.internal',
]);

export function isAlwaysBlockedAddress(address: string): boolean {
    let a = address.trim().toLowerCase().replace(/\.$/, '');
    if (a.startsWith('[') && a.endsWith(']')) a = a.slice(1, -1);
    if (a.startsWith('::ffff:')) a = a.slice(7);
    if (METADATA_HOSTNAMES.has(a)) return true;
    if (isIP(a) === 4) {
        return (
            a.startsWith('169.254.') || // link-local, incl. 169.254.169.254 / 169.254.170.2
            a === '168.63.129.16' || // Azure wire server
            a === '100.100.100.200' // Alibaba Cloud metadata
        );
    }
    if (isIP(a) === 6) return a.startsWith('fe80:') || a === 'fd00:ec2::254';
    return false;
}

export async function validateHost(
    host: string,
    allowPrivateNetworks = false,
): Promise<{ valid: boolean; error?: string }> {
    const metadataError = { valid: false, error: 'Cloud metadata addresses are not allowed' };
    if (isAlwaysBlockedAddress(host)) return metadataError;
    if (allowPrivateNetworks) {
        // Private ranges are allowed, but a hostname may still point at metadata.
        if (isIP(host.trim().replace(/^\[|\]$/g, '')) === 0) {
            try {
                const addrs = await dns.lookup(host.trim().toLowerCase(), { all: true });
                if (addrs.some((a) => isAlwaysBlockedAddress(a.address))) return metadataError;
            } catch {
                // Labs without DNS: unresolvable names stay allowed in this mode.
            }
        }
        return { valid: true };
    }

    const trimmed = host.trim().toLowerCase();

    // Reject obvious localhost variants
    if (trimmed === 'localhost' || trimmed === 'localhost.') {
        return { valid: false, error: 'Connections to localhost are not allowed' };
    }

    // If it's a raw IP, check immediately
    const ipVersion = isIP(trimmed);
    if (ipVersion === 4) {
        if (isBlockedIPv4(trimmed)) {
            return {
                valid: false,
                error: 'Connections to private/reserved IP addresses are not allowed',
            };
        }
        return { valid: true };
    }
    if (ipVersion === 6) {
        if (isBlockedIPv6(trimmed)) {
            return {
                valid: false,
                error: 'Connections to private/reserved IP addresses are not allowed',
            };
        }
        return { valid: true };
    }

    // Hostname — resolve and check each returned IP
    try {
        const addresses = await dns.lookup(trimmed, { all: true });
        for (const addr of addresses) {
            const version = isIP(addr.address);
            if (version === 4 && isBlockedIPv4(addr.address)) {
                return { valid: false, error: 'Hostname resolves to a private/reserved address' };
            }
            if (version === 6 && isBlockedIPv6(addr.address)) {
                return { valid: false, error: 'Hostname resolves to a private/reserved address' };
            }
        }
    } catch {
        // DNS resolution failed — block to prevent SSRF via unresolvable hostnames.
        // Users on private networks without DNS can set ALLOW_PRIVATE_NETWORKS=true.
        return {
            valid: false,
            error: 'Unable to resolve hostname — check that the address is correct and reachable',
        };
    }

    return { valid: true };
}

/**
 * Host check for a server reached through a jump host.
 *
 * Such a host is dialed by the *bastion*, inside its own network — the same
 * capability `ssh -J` grants — never by this server, so private addresses are
 * exactly what it is for and the SSRF ruleset does not apply. Only the syntax
 * is checked. The bastion's own host went through `validateHost` when it was
 * saved, and is re-checked when tokens are minted.
 */
export function validateJumpTargetHost(host: string): { valid: boolean; error?: string } {
    const trimmed = host.trim();
    if (!trimmed || trimmed.length > 253 || !/^[A-Za-z0-9._:[\]-]+$/.test(trimmed)) {
        return { valid: false, error: 'Enter a valid hostname or IP address' };
    }
    return { valid: true };
}
